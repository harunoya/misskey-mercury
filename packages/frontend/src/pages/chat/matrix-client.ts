/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type MatrixSession = {
	homeserverUrl: string;
	accessToken: string;
	userId: string;
	deviceId?: string;
};

export function isMatrixSession(value: unknown): value is MatrixSession {
	if (value == null || typeof value !== 'object') return false;
	const session = value as Partial<MatrixSession>;
	if (typeof session.homeserverUrl !== 'string' ||
		typeof session.accessToken !== 'string' || session.accessToken.length === 0 ||
		typeof session.userId !== 'string' || session.userId.length === 0) return false;
	try {
		normalizeHomeserverUrl(session.homeserverUrl);
		return true;
	} catch {
		return false;
	}
}

export function matrixSessionKey(session: MatrixSession): string {
	return `${normalizeHomeserverUrl(session.homeserverUrl)}\n${session.userId}`;
}

export function upsertMatrixSession(sessions: MatrixSession[], nextSession: MatrixSession): MatrixSession[] {
	const nextKey = matrixSessionKey(nextSession);
	return [nextSession, ...sessions.filter(session => matrixSessionKey(session) !== nextKey)];
}

export type MatrixEvent = {
	type: string;
	event_id?: string;
	sender?: string;
	state_key?: string;
	origin_server_ts?: number;
	content?: Record<string, unknown>;
	/** Present on a redacted event, and carries the redaction that removed it. */
	unsigned?: Record<string, unknown>;
	/** Set on redactions; the event being removed. */
	redacts?: string;
};

export type MatrixJoinedRoom = {
	state?: { events?: MatrixEvent[] };
	timeline?: {
		events?: MatrixEvent[];
		/** Pagination token for reading further back than this sync delivered. */
		prev_batch?: string;
		/** The server dropped events between the last sync and this one. */
		limited?: boolean;
	};
	ephemeral?: { events?: MatrixEvent[] };
	unread_notifications?: { notification_count?: number };
};

// A room someone has invited us to. The server sends a stripped state subset — enough to show who
// is inviting and to what — and nothing appears under `join` until the invite is accepted.
export type MatrixInvitedRoom = {
	invite_state?: { events?: MatrixEvent[] };
};

export class MatrixApiError extends Error {
	public readonly status: number;
	public readonly errcode?: string;
	/** How long the homeserver wants us to wait, from `retry_after_ms` on a rate limited response. */
	public readonly retryAfterMs?: number;

	constructor(status: number, message: string, errcode?: string, retryAfterMs?: number) {
		super(message);
		this.name = 'MatrixApiError';
		this.status = status;
		this.errcode = errcode;
		this.retryAfterMs = retryAfterMs;
	}

	/** The access token was rejected; waiting will not help and the session has to be re-established. */
	public get isAuthenticationFailure(): boolean {
		return this.errcode === 'M_UNKNOWN_TOKEN' || this.errcode === 'M_MISSING_TOKEN' || this.status === 401;
	}
}

export function normalizeHomeserverUrl(input: string): string {
	const url = new URL(input.trim());
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new TypeError('The homeserver URL must use HTTP or HTTPS.');
	}
	url.pathname = url.pathname.replace(/\/+$/, '');
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/$/, '');
}

/** Splits `mxc://server/id` into its two halves, or returns `null` for anything else. */
export function parseMxcUrl(mxcUrl: unknown): { serverName: string; mediaId: string } | null {
	if (typeof mxcUrl !== 'string' || !mxcUrl.startsWith('mxc://')) return null;
	const [serverName, mediaId] = mxcUrl.slice('mxc://'.length).split('/');
	if (!serverName || !mediaId) return null;
	return { serverName, mediaId };
}

/**
 * Resolves what someone typed into the homeserver that actually serves their account.
 *
 * People know their Matrix id, not their homeserver's client API origin, and the two often differ:
 * `@user:example.com` is commonly served from `matrix.example.com`. The spec's answer is the
 * `.well-known/matrix/client` document on the id's domain, so it is consulted before falling back
 * to treating the input as an origin.
 */
function isPlainHttpHomeserverHost(host: string): boolean {
	const hostname = host.replace(/^\[(.*)\]$/, '$1').toLowerCase();
	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
	if (hostname.endsWith('.local')) return true;
	const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (ipv4 == null) return false;
	const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
	// WSL2 and LAN homeservers (10/8, 172.16/12, 192.168/16) are HTTP.
	return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31;
}

function guessHomeserverOrigin(input: string): string {
	const trimmed = input.trim();
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	const host = trimmed.split('/')[0] ?? trimmed;
	const hostname = host.includes(']:') ? host.slice(1, host.indexOf(']')) : (host.split(':')[0] ?? host);
	if (isPlainHttpHomeserverHost(hostname) || isPlainHttpHomeserverHost(host)) {
		return `http://${trimmed}`;
	}
	return `https://${trimmed}`;
}

export async function discoverHomeserver(input: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<string> {
	const trimmed = input.trim();
	// A bare server name or a Matrix id, rather than a URL.
	const domain = trimmed.startsWith('@') ? trimmed.split(':').slice(1).join(':') : trimmed;
	const candidate = guessHomeserverOrigin(domain);
	const origin = normalizeHomeserverUrl(candidate);

	try {
		const response = await fetchImpl(`${origin}/.well-known/matrix/client`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});
		if (response.ok) {
			const body = await response.json() as { 'm.homeserver'?: { base_url?: unknown } };
			const baseUrl = body['m.homeserver']?.base_url;
			if (typeof baseUrl === 'string' && baseUrl.length > 0) return normalizeHomeserverUrl(baseUrl);
		}
	} catch {
		// No discovery document, or it is unreadable: the input stands on its own.
	}
	return origin;
}

/**
 * The homeserver calls made before there is a session to make them with.
 *
 * Everything a signed-in account does — syncing, sending, history, media, receipts — goes through
 * `matrix-sdk-runtime.ts` and matrix-js-sdk, which owns the crypto and the timeline. This class
 * covers only the two moments where that client cannot exist yet: signing in, and revoking a token
 * that has been replaced.
 *
 * It used to carry a second, hand-written implementation of the whole client API alongside those.
 * None of it ran — the SDK had taken over every caller — but it stayed covered by tests, so the
 * suite reported a Matrix client working while the one the app actually used went untested.
 */
export class MatrixAuthClient {
	private readonly homeserverUrl: string;

	constructor(
		public readonly session: MatrixSession,
		private readonly fetchImpl: typeof fetch = globalThis.fetch,
	) {
		this.homeserverUrl = normalizeHomeserverUrl(session.homeserverUrl);
	}

	public static async login(
		homeserverUrl: string,
		user: string,
		password: string,
		fetchImpl: typeof fetch = globalThis.fetch,
	): Promise<MatrixSession> {
		// Resolves `example.com` or `@me:example.com` to wherever the client API really lives.
		const normalizedHomeserverUrl = await discoverHomeserver(homeserverUrl, fetchImpl);
		await MatrixAuthClient.requestFrom<Record<string, unknown>>(
			fetchImpl,
			normalizedHomeserverUrl,
			'/_matrix/client/versions',
			{ method: 'GET' },
		);

		const response = await MatrixAuthClient.requestFrom<{
			access_token: string;
			user_id: string;
			device_id?: string;
		}>(fetchImpl, normalizedHomeserverUrl, '/_matrix/client/v3/login', {
			method: 'POST',
			body: JSON.stringify({
				type: 'm.login.password',
				identifier: {
					type: 'm.id.user',
					user: user.trim(),
				},
				password,
				initial_device_display_name: 'Misskey Mercury Web',
			}),
		});
		if (typeof response.access_token !== 'string' || response.access_token.length === 0 ||
			typeof response.user_id !== 'string' || response.user_id.length === 0) {
			throw new MatrixApiError(200, 'The homeserver returned an invalid login response.');
		}

		return {
			homeserverUrl: normalizedHomeserverUrl,
			accessToken: response.access_token,
			userId: response.user_id,
			deviceId: response.device_id,
		};
	}

	public async logout(): Promise<void> {
		await MatrixAuthClient.requestFrom(
			this.fetchImpl,
			this.homeserverUrl,
			'/_matrix/client/v3/logout',
			{ method: 'POST' },
			this.session.accessToken,
		);
	}

	private static async requestFrom<T>(
		fetchImpl: typeof fetch,
		homeserverUrl: string,
		path: string,
		init: RequestInit,
		accessToken?: string,
	): Promise<T> {
		const headers = new Headers(init.headers);
		headers.set('Accept', 'application/json');
		if (init.body != null) headers.set('Content-Type', 'application/json');
		if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

		// Called through a local binding, not as `this.fetchImpl(...)`: the native `fetch` throws
		// "Illegal invocation" when its `this` is anything but the window.
		const response = await fetchImpl(`${homeserverUrl}${path}`, { ...init, headers });
		const result = await response.json().catch(() => ({})) as Record<string, unknown>;
		if (!response.ok) {
			throw new MatrixApiError(
				response.status,
				typeof result.error === 'string' ? result.error : response.statusText,
				typeof result.errcode === 'string' ? result.errcode : undefined,
				typeof result.retry_after_ms === 'number' ? result.retry_after_ms : undefined,
			);
		}
		return result as T;
	}
}
