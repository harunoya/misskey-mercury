/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * API_COMPAT
 *
 * v11 talks to the API through `fetch` from `MiOS.api()`, the `/api/i` bootstrap in `MiOS.init()`
 * and a handful of components. Patching `fetch` fixes every one of those call sites at once, so no
 * v11 source has to change. Three separate incompatibilities are handled here — see each helper.
 *
 * Multipart uploads (`uploader.vue`) go through XMLHttpRequest and are unaffected; they already
 * interoperate with the current backend.
 */

const apiPathPrefix = '/api/';

/**
 * v11 predates the snake_case → kebab-case endpoint rename. Only endpoints that still exist under
 * a new name are listed; features the current backend dropped entirely are deliberately absent so
 * they keep failing loudly instead of being silently redirected somewhere wrong.
 */
const renamedEndpoints = new Map<string, string>([
	['i/authorized_apps', 'i/authorized-apps'],
	['i/change_password', 'i/change-password'],
	['i/regenerate_token', 'i/regenerate-token'],
	['i/signin_history', 'i/signin-history'],
	['i/update_email', 'i/update-email'],
	['drive/files/upload_from_url', 'drive/files/upload-from-url'],
	['notifications/mark_all_as_read', 'notifications/mark-all-as-read'],
	['users/get_frequently_replied_users', 'users/get-frequently-replied-users'],
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v11 kept a signed-in account's client settings in a `clientData` column on the user: the
 * settings screens wrote them with `i/update-client-setting`, and `/api/i` handed them back for
 * `settings/merge` to apply at boot. The current backend has neither half — the endpoint answers
 * 404 and `/api/i` carries no `clientData` — so every setting stayed in whichever browser set it
 * and nothing followed the account. The registry stores the same thing (an arbitrary JSON value
 * under a string key), so both halves are re-pointed at it below.
 *
 * A top-level scope of its own rather than a sub-scope of `client`: registry rows are addressed by
 * their full scope path, and `client` belongs to the current client — `['client', 'base']` and
 * `['client', 'deck']` from pizzax, `['client', 'preferences', …]` from preference sync. The two
 * key sets already collide on `memo`, which means different things in each client, so sharing a
 * scope would have them overwriting each other.
 */
const clientSettingScope = ['mercury', 'v11'];

/**
 * Rewrites a request before it is sent. Returns `null` to send it unchanged.
 */
function rewriteRequest(endpoint: string, body: unknown): { endpoint: string; body: string } | null {
	if (typeof body !== 'string') return null;

	let data: unknown;
	try {
		data = JSON.parse(body);
	} catch {
		return null;
	}
	if (!isPlainObject(data)) return null;

	if (endpoint === 'i/update-client-setting') {
		const { name, value, ...rest } = data;
		return {
			endpoint: 'i/registry/set',
			// `value` is required by the registry, and `undefined` would disappear in
			// `JSON.stringify` and come back as a 400 rather than as the "no value" v11 means.
			body: JSON.stringify({ ...rest, scope: clientSettingScope, key: name, value: value ?? null }),
		};
	}

	if (endpoint === 'i/update') {
		let changed = false;
		const patched: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(data)) {
			// v11 sent `''` for a profile field the reader had cleared. Every one of them is now a
			// 400: `lang` against its enum, `birthday` against its pattern, `name` / `description`
			// / `location` against `minLength: 1`. `null` is what they all accept and it means the
			// same thing — v11's own `save()` already writes `|| null` for four of the five and
			// only misses `lang`, so this is that same conversion applied to the whole payload.
			// The credential is never empty; blanking it would turn a 400 into a confusing 401.
			if (value === '' && key !== 'i') {
				patched[key] = null;
				changed = true;
				continue;
			}

			// The profile editor always sends its four metadata rows, filling the unused ones with
			// `{ name: null, value: null }`, and the current schema types both halves as a
			// non-nullable string. A row is only a field once both halves are filled, which is
			// also where the current client draws the line
			// (`packages/frontend/src/pages/settings/profile.vue`), so the blank ones are dropped
			// rather than saved as empty strings that would show up on the public profile.
			if (key === 'fields' && Array.isArray(value)) {
				const filled = value.filter(field => isPlainObject(field)
					&& typeof field.name === 'string' && field.name !== ''
					&& typeof field.value === 'string' && field.value !== '');
				if (filled.length !== value.length) changed = true;
				patched[key] = filled;
				continue;
			}

			patched[key] = value;
		}

		return changed ? { endpoint, body: JSON.stringify(patched) } : null;
	}

	return null;
}

/** v11 puts the credential in the request body, which is where the registry read has to get it. */
function credentialOf(body: unknown): string | null {
	if (typeof body !== 'string') return null;

	try {
		const data: unknown = JSON.parse(body);
		return isPlainObject(data) && typeof data.i === 'string' ? data.i : null;
	} catch {
		return null;
	}
}

/**
 * The read half of {@link clientSettingScope}. Returns `null` when the settings could not be read,
 * which leaves `clientData` absent so `settings/merge` keeps the defaults rather than being handed
 * an empty object that looks like a deliberately empty account.
 */
async function fetchClientData(token: string, nativeFetch: typeof globalThis.fetch): Promise<Record<string, unknown> | null> {
	try {
		const res = await nativeFetch('/api/i/registry/get-all', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ i: token, scope: clientSettingScope }),
		});

		if (!res.ok) {
			console.error(`[v11] could not load account settings: i/registry/get-all answered ${res.status}`);
			return null;
		}

		const body: unknown = await res.json();
		return isPlainObject(body) ? body : null;
	} catch (err) {
		console.error('[v11] could not load account settings', err);
		return null;
	}
}

/**
 * v11 resolves custom emojis per object: components hand `note.emojis` / `user.emojis` to
 * `mk-emoji`, which calls `.find(x => x.name === …)` on it inside `created()`. The current backend
 * broke that contract twice over — `user.emojis` became a `{ name: url }` map (so `.find` is not a
 * function and the component throws), and notes stopped carrying `emojis` at all now that the
 * emoji set is instance-global. Rebuilding the array shape, and falling back to the instance list
 * when the field is gone, restores rendering without touching a single v11 file.
 */
function isEmojiCarrier(value: Record<string, unknown>): boolean {
	if (typeof value.id !== 'string') return false;
	return typeof value.username === 'string' || typeof value.userId === 'string';
}

function normalizeEmojis(value: unknown, instanceEmojis: readonly unknown[]): unknown {
	if (Array.isArray(value)) {
		for (const entry of value) normalizeEmojis(entry, instanceEmojis);
		return value;
	}

	if (!isPlainObject(value)) return value;

	for (const [key, child] of Object.entries(value)) {
		if (key === 'emojis' && isPlainObject(child)) {
			value[key] = Object.entries(child).map(([name, url]) => ({ name, url }));
			continue;
		}
		normalizeEmojis(child, instanceEmojis);
	}

	if (!('emojis' in value) && isEmojiCarrier(value)) {
		value.emojis = instanceEmojis;
	}

	return value;
}

// `/api/meta` no longer carries the emoji list (it moved to `/api/emojis`), but `reaction-icon.vue`
// still reads `meta.emojis`. Fetched once and shared by reference: it is also the fallback injected
// into notes, and v11 re-fetches meta every minute.
let emojiListPromise: Promise<readonly unknown[]> | null = null;
let instanceEmojis: readonly unknown[] = [];

function fetchEmojiList(nativeFetch: typeof globalThis.fetch): Promise<readonly unknown[]> {
	emojiListPromise ??= nativeFetch('/api/emojis', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
	})
		.then(res => (res.ok ? res.json() : null))
		.then(body => (isPlainObject(body) && Array.isArray(body.emojis) ? body.emojis as unknown[] : []))
		.catch(() => [])
		.then(list => (instanceEmojis = list));

	return emojiListPromise;
}

// Announcements became their own endpoint; v11 reads `meta.announcements` for the nav badge, the
// broadcast widget and the welcome page.
let announcementsPromise: Promise<unknown[]> | null = null;

function fetchAnnouncements(nativeFetch: typeof globalThis.fetch): Promise<unknown[]> {
	announcementsPromise ??= nativeFetch('/api/announcements', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
	})
		.then(res => (res.ok ? res.json() : null))
		.then(body => (Array.isArray(body) ? body as unknown[] : []))
		.catch(() => []);

	return announcementsPromise;
}

/**
 * Restores the instance settings v11 reads off `meta` that the current backend has since moved or
 * dropped. Without them the affected features do not degrade gracefully — they read `undefined`,
 * treat it as "off", and silently disappear.
 */
async function backfillMeta(meta: Record<string, unknown>, nativeFetch: typeof globalThis.fetch): Promise<void> {
	if (!Array.isArray(meta.emojis)) meta.emojis = await fetchEmojiList(nativeFetch);
	if (!Array.isArray(meta.announcements)) meta.announcements = await fetchAnnouncements(nativeFetch);

	// The instance-wide switch is gone; reacting with an arbitrary emoji is now always allowed and
	// governed per role instead. Left falsy, `reaction-picker.vue` hides its input entirely and no
	// custom emoji reaction can be sent at all.
	meta.enableEmojiReaction ??= true;

	// Timeline availability moved from instance flags to role policies.
	const policies = isPlainObject(meta.policies) ? meta.policies : {};
	meta.disableLocalTimeline ??= policies.ltlAvailable === false;
	meta.disableGlobalTimeline ??= policies.gtlAvailable === false;

	// Same link, different capitalisation.
	meta.ToSUrl ??= meta.tosUrl ?? null;
}

function endpointOf(pathname: string): string {
	return pathname.slice(apiPathPrefix.length);
}

function resolveUrl(input: RequestInfo | URL): URL | null {
	const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

	try {
		const url = new URL(raw, location.href);
		return url.origin === location.origin && url.pathname.startsWith(apiPathPrefix) ? url : null;
	} catch {
		return null;
	}
}

export function installApiCompatibility(): void {
	const nativeFetch = window.fetch.bind(window);

	// Warm the list so the first timeline render already has emojis to resolve against.
	void fetchEmojiList(nativeFetch);

	window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = resolveUrl(input);
		if (url == null) return nativeFetch(input, init);

		let target: RequestInfo | URL = input;
		let options = init;
		const requested = endpointOf(url.pathname);

		const renamed = renamedEndpoints.get(requested);
		if (renamed != null) {
			url.pathname = apiPathPrefix + renamed;
			target = url.href;
		}

		// v11 never sets a Content-Type, so browsers send `text/plain;charset=UTF-8`. The current
		// backend leaves such a body unparsed, never sees the credential in `data.i`, and answers
		// 401 — which v11 reads as an invalid session, calling `signout()` and bouncing to `/`.
		// FormData bodies keep their own multipart boundary and must not be touched.
		if (options != null && typeof options.body === 'string') {
			const headers = new Headers(options.headers ?? {});
			if (!headers.has('Content-Type')) {
				headers.set('Content-Type', 'application/json');
				options = { ...options, headers };
			}
		}

		// Kept after the header fix so it sees — and preserves — the headers set above.
		const rewritten = rewriteRequest(requested, options?.body);
		if (rewritten != null) {
			if (rewritten.endpoint !== requested) {
				url.pathname = apiPathPrefix + rewritten.endpoint;
				target = url.href;
			}
			options = { ...options, body: rewritten.body };
		}

		const response = await nativeFetch(target, options);
		if (!response.ok || response.status === 204) return response;
		if (!(response.headers.get('Content-Type') ?? '').includes('application/json')) return response;

		let body: unknown;
		try {
			body = await response.clone().json();
		} catch {
			return response;
		}

		normalizeEmojis(body, instanceEmojis);

		if (requested === 'meta' && isPlainObject(body)) {
			await backfillMeta(body, nativeFetch);
		}

		// See {@link clientSettingScope}: `/api/i` is where v11 expects to find the account's
		// settings, and it is the only place `settings/merge` is ever driven from.
		if (requested === 'i' && isPlainObject(body) && body.clientData == null) {
			const token = credentialOf(options?.body);
			if (token != null) {
				const clientData = await fetchClientData(token, nativeFetch);
				if (clientData != null) body.clientData = clientData;
			}
		}

		return new Response(JSON.stringify(body), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	};
}
