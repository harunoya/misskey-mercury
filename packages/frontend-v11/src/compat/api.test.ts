/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest';
import { CurrentApiClient } from './api.js';
import { toV11NetworkChart } from './charts.js';
import { toV11ChatMessage } from './chat.js';

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('CurrentApiClient', () => {
	it('uses only the current endpoint and request schema for local custom reactions', async () => {
		const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			expect(JSON.parse(String(init?.body))).toEqual({
				i: 'token',
				noteId: 'note',
				reaction: ':party@.:',
			});
			return jsonResponse({ reactions: { ':party@.:': 2 }, myReaction: ':party@.:' });
		});
		const client = new CurrentApiClient({ getToken: () => 'token', fetch });

		const response = await client.request('notes/reactions/create', {
			noteId: 'note',
			reaction: ':party:',
		});

		expect(fetch).toHaveBeenCalledWith('/api/notes/reactions/create', expect.any(Object));
		expect(response).toEqual({ reactions: { ':party:': 2 }, myReaction: ':party:' });
	});

	it('maps the current unread-chat account field to the v11 field', async () => {
		const fetch = vi.fn(async () => jsonResponse({
			id: 'me',
			clientData: {},
			hasUnreadChatMessages: true,
		}));
		const client = new CurrentApiClient({ getToken: () => 'token', fetch });

		const me = await client.request('i');

		expect((me as any).hasUnreadMessagingMessage).toBe(true);
	});

	it('rejects attempts to escape the same-origin endpoint namespace', async () => {
		const client = new CurrentApiClient({ getToken: () => null, fetch: vi.fn() });
		await expect(client.request('https://example.com' as never)).rejects.toThrow('same-origin');
	});
});

describe('current response adapters', () => {
	it('maps current chat field names to the v11 messaging model', () => {
		const me = { id: 'me', username: 'me' };
		const other = { id: 'other', username: 'other' };
		const message = toV11ChatMessage({
			id: 'message',
			fromUserId: 'other',
			fromUser: other,
			toUserId: 'me',
			toUser: me,
			isRead: true,
		}, me, other);

		expect(message.userId).toBe('other');
		expect(message.recipientId).toBe('me');
		expect(message.reads).toEqual(['me']);
	});

	it('maps the current AP request chart without inventing removed byte or timing metrics', () => {
		expect(toV11NetworkChart({
			inboxReceived: [4, 2],
			deliverSucceeded: [3, 1],
			deliverFailed: [1, 2],
		})).toEqual({
			incomingRequests: [4, 2],
			outgoingRequests: [4, 3],
			failedRequests: [1, 2],
		});
	});
});
