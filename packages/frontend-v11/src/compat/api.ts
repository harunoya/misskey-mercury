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

		const renamed = renamedEndpoints.get(endpointOf(url.pathname));
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

		if (endpointOf(url.pathname) === 'meta' && isPlainObject(body) && !Array.isArray(body.emojis)) {
			body.emojis = await fetchEmojiList(nativeFetch);
		}

		return new Response(JSON.stringify(body), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	};
}
