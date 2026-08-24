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
};

export type MatrixJoinedRoom = {
	state?: { events?: MatrixEvent[] };
	timeline?: { events?: MatrixEvent[] };
	unread_notifications?: { notification_count?: number };
};

export type MatrixSyncResponse = {
	next_batch: string;
	rooms?: {
		join?: Record<string, MatrixJoinedRoom>;
		leave?: Record<string, unknown>;
	};
};

export class MatrixApiError extends Error {
	public readonly status: number;
	public readonly errcode?: string;

	constructor(status: number, message: string, errcode?: string) {
		super(message);
		this.name = 'MatrixApiError';
		this.status = status;
		this.errcode = errcode;
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

export class MatrixClient {
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
		const normalizedHomeserverUrl = normalizeHomeserverUrl(homeserverUrl);
		await MatrixClient.requestFrom<Record<string, unknown>>(
			fetchImpl,
			normalizedHomeserverUrl,
			'/_matrix/client/versions',
			{ method: 'GET' },
		);

		const response = await MatrixClient.requestFrom<{
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

	public sync(since?: string, signal?: AbortSignal): Promise<MatrixSyncResponse> {
		const query = new URLSearchParams({
			timeout: '30000',
			set_presence: 'offline',
		});
		if (since) query.set('since', since);
		return this.request<MatrixSyncResponse>(`/_matrix/client/v3/sync?${query}`, { method: 'GET', signal });
	}

	public async sendText(roomId: string, body: string): Promise<{ event_id: string }> {
		const transactionId = `${Date.now()}-${crypto.randomUUID()}`;
		return this.request(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(transactionId)}`, {
			method: 'PUT',
			body: JSON.stringify({
				msgtype: 'm.text',
				body,
			}),
		});
	}

	public async createDirectRoom(userId: string): Promise<{ room_id: string }> {
		return this.request('/_matrix/client/v3/createRoom', {
			method: 'POST',
			body: JSON.stringify({
				is_direct: true,
				invite: [userId.trim()],
				preset: 'trusted_private_chat',
			}),
		});
	}

	public async markAsRead(roomId: string, eventId: string): Promise<void> {
		await this.request(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/read_markers`, {
			method: 'POST',
			body: JSON.stringify({
				'm.fully_read': eventId,
				'm.read': eventId,
			}),
		});
	}

	public async logout(): Promise<void> {
		await this.request('/_matrix/client/v3/logout', { method: 'POST' });
	}

	private request<T>(path: string, init: RequestInit): Promise<T> {
		return MatrixClient.requestFrom<T>(this.fetchImpl, this.homeserverUrl, path, init, this.session.accessToken);
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

		const response = await fetchImpl(`${homeserverUrl}${path}`, { ...init, headers });
		const result = await response.json().catch(() => ({})) as Record<string, unknown>;
		if (!response.ok) {
			throw new MatrixApiError(
				response.status,
				typeof result.error === 'string' ? result.error : response.statusText,
				typeof result.errcode === 'string' ? result.errcode : undefined,
			);
		}
		return result as T;
	}
}
