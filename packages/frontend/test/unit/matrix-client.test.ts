/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { isMatrixSession, MatrixApiError, MatrixClient, matrixSessionKey, normalizeHomeserverUrl, upsertMatrixSession } from '@/pages/chat/matrix-client.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
		...init,
	});
}

describe('MatrixApiError', () => {
	test('recognises a rejected access token', () => {
		expect(new MatrixApiError(401, 'no', 'M_UNKNOWN_TOKEN').isAuthenticationFailure).toBe(true);
		expect(new MatrixApiError(403, 'no', 'M_MISSING_TOKEN').isAuthenticationFailure).toBe(true);
		expect(new MatrixApiError(401, 'no').isAuthenticationFailure).toBe(true);
		// A rate limit clears on its own; treating it as a dead session would sign the user out.
		expect(new MatrixApiError(429, 'slow down', 'M_LIMIT_EXCEEDED').isAuthenticationFailure).toBe(false);
	});

	test('carries the retry delay from a rate limited response', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(
			{ errcode: 'M_LIMIT_EXCEEDED', error: 'Too Many Requests', retry_after_ms: 4200 },
			{ status: 429 },
		));
		const client = new MatrixClient({ homeserverUrl: 'https://matrix.example', accessToken: 'token', userId: '@alice:example.com' }, fetchMock);

		await expect(client.sync()).rejects.toMatchObject({ status: 429, retryAfterMs: 4200 });
	});
});

describe('room membership', () => {
	test('joins and leaves a room by id', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ room_id: '!room:example.com' }));
		const client = new MatrixClient({ homeserverUrl: 'https://matrix.example', accessToken: 'token', userId: '@alice:example.com' }, fetchMock);

		await client.joinRoom('!room:example.com');
		expect(fetchMock.mock.calls[0]![0]).toBe('https://matrix.example/_matrix/client/v3/rooms/!room%3Aexample.com/join');

		await client.leaveRoom('!room:example.com');
		expect(fetchMock.mock.calls[1]![0]).toBe('https://matrix.example/_matrix/client/v3/rooms/!room%3Aexample.com/leave');
	});
});

describe('normalizeHomeserverUrl', () => {
	test('normalizes a homeserver origin', () => {
		expect(normalizeHomeserverUrl(' https://matrix.example/ ')).toBe('https://matrix.example');
	});

	test('rejects non-HTTP URLs', () => {
		expect(() => normalizeHomeserverUrl('javascript:alert(1)')).toThrow(TypeError);
	});
});

describe('Matrix session storage', () => {
	test('validates persisted sessions', () => {
		expect(isMatrixSession({ homeserverUrl: 'https://matrix.example', accessToken: 'secret', userId: '@alice:example.com' })).toBe(true);
		expect(isMatrixSession({ homeserverUrl: 'javascript:alert(1)', accessToken: 'secret', userId: '@alice:example.com' })).toBe(false);
		expect(isMatrixSession({ homeserverUrl: 'https://matrix.example', accessToken: '', userId: '@alice:example.com' })).toBe(false);
	});

	test('replaces the same account and moves it to the front', () => {
		const alice = { homeserverUrl: 'https://matrix.example', accessToken: 'old', userId: '@alice:example.com' };
		const bob = { homeserverUrl: 'https://matrix.example', accessToken: 'bob', userId: '@bob:example.com' };
		const updatedAlice = { ...alice, homeserverUrl: 'https://matrix.example/', accessToken: 'new' };

		expect(upsertMatrixSession([alice, bob], updatedAlice)).toEqual([updatedAlice, bob]);
		expect(matrixSessionKey(alice)).toBe(matrixSessionKey(updatedAlice));
	});

	test('keeps accounts from different homeservers', () => {
		const first = { homeserverUrl: 'https://one.example', accessToken: 'one', userId: '@alice:example.com' };
		const second = { homeserverUrl: 'https://two.example', accessToken: 'two', userId: '@alice:example.com' };

		expect(upsertMatrixSession([first], second)).toEqual([second, first]);
	});
});

describe('MatrixClient', () => {
	test('logs in with a password after checking the homeserver', async () => {
		const fetchMock = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ versions: ['v1.15'] }))
			.mockResolvedValueOnce(jsonResponse({ access_token: 'secret', user_id: '@alice:example.com', device_id: 'DEVICE' }));

		const session = await MatrixClient.login('https://matrix.example/', '@alice:example.com', 'password', fetchMock);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0]?.[0]).toBe('https://matrix.example/_matrix/client/versions');
		expect(fetchMock.mock.calls[1]?.[0]).toBe('https://matrix.example/_matrix/client/v3/login');
		expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
			type: 'm.login.password',
			identifier: { type: 'm.id.user', user: '@alice:example.com' },
		});
		expect(session).toEqual({
			homeserverUrl: 'https://matrix.example',
			accessToken: 'secret',
			userId: '@alice:example.com',
			deviceId: 'DEVICE',
		});
	});

	test('rejects an invalid login response', async () => {
		const fetchMock = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ versions: ['v1.15'] }))
			.mockResolvedValueOnce(jsonResponse({ user_id: '@alice:example.com' }));

		await expect(MatrixClient.login('https://matrix.example', '@alice:example.com', 'password', fetchMock)).rejects.toEqual(
			expect.objectContaining<Partial<MatrixApiError>>({
				status: 200,
				message: 'The homeserver returned an invalid login response.',
			}),
		);
	});

	test('uses an authorization header for authenticated requests', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ next_batch: 'next' }));
		const client = new MatrixClient({
			homeserverUrl: 'https://matrix.example',
			accessToken: 'secret',
			userId: '@alice:example.com',
		}, fetchMock);

		await client.sync('previous');

		const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
		expect(headers.get('Authorization')).toBe('Bearer secret');
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain('since=previous');
		expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('secret');
	});

	test('sends read markers to the selected room', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
		const client = new MatrixClient({
			homeserverUrl: 'https://matrix.example',
			accessToken: 'secret',
			userId: '@alice:example.com',
		}, fetchMock);

		await client.markAsRead('!room:example.com', '$event');

		expect(fetchMock.mock.calls[0]?.[0]).toBe('https://matrix.example/_matrix/client/v3/rooms/!room%3Aexample.com/read_markers');
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
			'm.fully_read': '$event',
			'm.read': '$event',
		});
	});

	test('logs out the authenticated session', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
		const client = new MatrixClient({
			homeserverUrl: 'https://matrix.example',
			accessToken: 'secret',
			userId: '@alice:example.com',
		}, fetchMock);

		await client.logout();

		expect(fetchMock.mock.calls[0]?.[0]).toBe('https://matrix.example/_matrix/client/v3/logout');
		expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
		expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer secret');
	});

	test('returns Matrix error details', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
			errcode: 'M_FORBIDDEN',
			error: 'Invalid password',
		}, { status: 403 }));

		await expect(MatrixClient.login('https://matrix.example', 'alice', 'wrong', fetchMock)).rejects.toEqual(
			expect.objectContaining<Partial<MatrixApiError>>({
				status: 403,
				errcode: 'M_FORBIDDEN',
				message: 'Invalid password',
			}),
		);
	});
});
