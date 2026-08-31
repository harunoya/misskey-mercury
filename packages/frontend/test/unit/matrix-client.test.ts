/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { discoverHomeserver, isMatrixSession, MatrixApiError, MatrixClient, matrixSessionKey, normalizeHomeserverUrl, parseMxcUrl, upsertMatrixSession } from '@/pages/chat/matrix-client.js';

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
			// Login now resolves the homeserver first; this one has no discovery document.
			.mockResolvedValueOnce(new Response('', { status: 404 }))
			.mockResolvedValueOnce(jsonResponse({ versions: ['v1.15'] }))
			.mockResolvedValueOnce(jsonResponse({ access_token: 'secret', user_id: '@alice:example.com', device_id: 'DEVICE' }));

		const session = await MatrixClient.login('https://matrix.example/', '@alice:example.com', 'password', fetchMock);

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[0]?.[0]).toBe('https://matrix.example/.well-known/matrix/client');
		expect(fetchMock.mock.calls[1]?.[0]).toBe('https://matrix.example/_matrix/client/versions');
		expect(fetchMock.mock.calls[2]?.[0]).toBe('https://matrix.example/_matrix/client/v3/login');
		expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
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
			.mockResolvedValueOnce(new Response('', { status: 404 }))
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

function testClient(fetchImpl: typeof fetch): MatrixClient {
	return new MatrixClient({ homeserverUrl: 'https://matrix.example', accessToken: 'secret', userId: '@alice:example.com' }, fetchImpl);
}

describe('parseMxcUrl', () => {
	test('splits a media URL', () => {
		expect(parseMxcUrl('mxc://example.com/abc123')).toEqual({ serverName: 'example.com', mediaId: 'abc123' });
	});

	test('rejects anything else', () => {
		expect(parseMxcUrl('https://example.com/abc')).toBeNull();
		expect(parseMxcUrl('mxc://example.com')).toBeNull();
		expect(parseMxcUrl(undefined)).toBeNull();
	});
});

describe('history', () => {
	test('reads backwards from a pagination token', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ chunk: [], end: 'older' }));

		await testClient(fetchMock).messages('!room:example.com', 'token', 20);

		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.pathname).toBe('/_matrix/client/v3/rooms/!room%3Aexample.com/messages');
		expect(url.searchParams.get('dir')).toBe('b');
		expect(url.searchParams.get('from')).toBe('token');
		expect(url.searchParams.get('limit')).toBe('20');
	});
});

describe('message actions', () => {
	test('an edit carries both the fallback and the replacement', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ event_id: '$new' }));

		await testClient(fetchMock).editText('!room:example.com', '$old', 'fixed');

		const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		// Clients without edit support show `body`, so it has to read as an edit on its own.
		expect(body.body).toBe('* fixed');
		expect(body['m.new_content']).toEqual({ msgtype: 'm.text', body: 'fixed' });
		expect(body['m.relates_to']).toEqual({ rel_type: 'm.replace', event_id: '$old' });
	});

	test('a reaction is an annotation on the target event', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ event_id: '$r' }));

		await testClient(fetchMock).sendReaction('!room:example.com', '$target', '👍');

		expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/send/m.reaction/');
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))['m.relates_to']).toEqual({
			rel_type: 'm.annotation', event_id: '$target', key: '👍',
		});
	});

	test('redacting targets the event being removed', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ event_id: '$r' }));

		await testClient(fetchMock).redact('!room:example.com', '$target');

		expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/rooms/!room%3Aexample.com/redact/%24target/');
		expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
	});

	test('two sends never reuse a transaction id', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ event_id: '$e' }));
		const client = testClient(fetchMock);

		await client.sendText('!room:example.com', 'one');
		await client.sendText('!room:example.com', 'two');

		expect(String(fetchMock.mock.calls[0]?.[0])).not.toBe(String(fetchMock.mock.calls[1]?.[0]));
	});
});

describe('media', () => {
	test('uploads with the file content type rather than JSON', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ content_uri: 'mxc://example.com/id' }));
		const file = new File(['hello'], 'note.txt', { type: 'text/plain' });

		await testClient(fetchMock).upload(file);

		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.pathname).toBe('/_matrix/media/v3/upload');
		expect(url.searchParams.get('filename')).toBe('note.txt');
		const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
		expect(headers.get('Content-Type')).toBe('text/plain');
		expect(headers.get('Authorization')).toBe('Bearer secret');
	});

	test('falls back to the unauthenticated media path on an older homeserver', async () => {
		const fetchMock = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 'M_UNRECOGNIZED' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
			.mockResolvedValueOnce(new Response(new Blob(['bytes']), { status: 200 }));

		await testClient(fetchMock).downloadMedia('mxc://example.com/abc');

		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://matrix.example/_matrix/client/v1/media/download/example.com/abc');
		expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://matrix.example/_matrix/media/v3/download/example.com/abc');
	});

	test('asks for a thumbnail when one is wanted', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Blob(['bytes']), { status: 200 }));

		await testClient(fetchMock).downloadMedia('mxc://example.com/abc', { width: 64, height: 64 });

		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.pathname).toBe('/_matrix/client/v1/media/thumbnail/example.com/abc');
		expect(url.searchParams.get('width')).toBe('64');
	});

	test('does not retry a rejected token against the old path', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ errcode: 'M_UNKNOWN_TOKEN' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
		);

		await expect(testClient(fetchMock).downloadMedia('mxc://example.com/abc')).rejects.toMatchObject({ status: 401 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('typing notifications', () => {
	test('sends a timeout while typing and none when stopping', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
		const client = testClient(fetchMock);

		await client.setTyping('!room:example.com', true);
		await client.setTyping('!room:example.com', false);

		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://matrix.example/_matrix/client/v3/rooms/!room%3Aexample.com/typing/%40alice%3Aexample.com');
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ typing: true, timeout: 20000 });
		expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ typing: false });
	});
});

describe('homeserver discovery', () => {
	test('follows .well-known to the real client API', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ 'm.homeserver': { base_url: 'https://matrix.example.com/' } }));

		// People type their own domain; the client API commonly lives on another host.
		expect(await discoverHomeserver('example.com', fetchMock)).toBe('https://matrix.example.com');
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://example.com/.well-known/matrix/client');
	});

	test('accepts a Matrix id and discovers from its domain', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ 'm.homeserver': { base_url: 'https://matrix.example.com' } }));

		expect(await discoverHomeserver('@alice:example.com', fetchMock)).toBe('https://matrix.example.com');
	});

	test('uses HTTP for a local homeserver without a scheme', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
		expect(await discoverHomeserver('localhost:8008', fetchMock)).toBe('http://localhost:8008');
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:8008/.well-known/matrix/client');
	});

	test('uses HTTP for a WSL private address without a scheme', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
		expect(await discoverHomeserver('172.27.213.65:8008', fetchMock)).toBe('http://172.27.213.65:8008');
	});

	test('falls back to the input when there is no discovery document', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));

		expect(await discoverHomeserver('https://matrix.example', fetchMock)).toBe('https://matrix.example');
	});

	test('falls back when the document is unreachable', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network'));

		expect(await discoverHomeserver('matrix.example', fetchMock)).toBe('https://matrix.example');
	});

	test('login resolves the homeserver before authenticating', async () => {
		const fetchMock = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ 'm.homeserver': { base_url: 'https://matrix.example.com' } }))
			.mockResolvedValueOnce(jsonResponse({ versions: ['v1.15'] }))
			.mockResolvedValueOnce(jsonResponse({ access_token: 'secret', user_id: '@alice:example.com' }));

		const session = await MatrixClient.login('example.com', '@alice:example.com', 'password', fetchMock);

		expect(session.homeserverUrl).toBe('https://matrix.example.com');
		expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://matrix.example.com/_matrix/client/versions');
	});
});
