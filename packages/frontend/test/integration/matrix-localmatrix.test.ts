/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Matrix behaviour against a real homeserver.
 *
 * The unit tests feed handwritten events to the store, which proves the derivation rules but not
 * that they match what a homeserver actually sends. These drive the local Synapse
 * (`test/synapse/start.sh`) and run its real responses through the same store code the app uses, so
 * a change in what Synapse returns — or a wrong assumption about it — fails here rather than in a
 * browser.
 *
 * Skipped when the homeserver is not running, so the suite stays usable without Docker.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { MatrixAuthClient, discoverHomeserver, MatrixApiError } from '@/pages/chat/matrix-client.js';
import type { MatrixEvent } from '@/pages/chat/matrix-client.js';
import { RoomEventStore } from '@/pages/chat/matrix-event-store.js';
import { deriveTimeline } from '@/pages/chat/matrix-store.js';

const HOMESERVER = (process.env.SYNAPSE_URL ?? 'http://127.0.0.1:8008').replace(/\/$/, '');
const ROOM_ID_PREFIX = '!';

let reachable = false;

type Creds = { user_id: string; access_token: string; device_id: string };

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set('Content-Type', 'application/json');
	if (init.token != null) headers.set('Authorization', `Bearer ${init.token}`);
	const response = await fetch(`${HOMESERVER}${path}`, { ...init, headers });
	const body = await response.json().catch(() => ({})) as Record<string, unknown>;
	if (!response.ok) {
		throw new MatrixApiError(
			response.status,
			typeof body.error === 'string' ? body.error : response.statusText,
			typeof body.errcode === 'string' ? body.errcode : undefined,
		);
	}
	return body as T;
}

/** Registers a throwaway account, so runs never collide with each other. */
async function register(prefix: string): Promise<Creds> {
	const username = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	return await api<Creds>('/_matrix/client/v3/register', {
		method: 'POST',
		body: JSON.stringify({ username, password: 'integration-pass-123', auth: { type: 'm.login.dummy' } }),
	});
}

async function send(creds: Creds, roomId: string, content: Record<string, unknown>, type = 'm.room.message'): Promise<string> {
	const txn = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const result = await api<{ event_id: string }>(
		`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${type}/${txn}`,
		{ method: 'PUT', token: creds.access_token, body: JSON.stringify(content) },
	);
	return result.event_id;
}

/** One `/sync` pass, returning the joined-room section the store consumes. */
async function syncOnce(creds: Creds, since?: string) {
	const query = new URLSearchParams({ timeout: '0' });
	if (since != null) query.set('since', since);
	return await api<{
		next_batch: string;
		rooms?: { join?: Record<string, { timeline?: { events?: MatrixEvent[]; prev_batch?: string } }> };
	}>(`/_matrix/client/v3/sync?${query}`, { method: 'GET', token: creds.access_token });
}

beforeAll(async () => {
	reachable = await fetch(`${HOMESERVER}/health`).then(r => r.ok).catch(() => false);
	if (!reachable) {
		console.warn(`[matrix] skipping integration tests: no homeserver at ${HOMESERVER}`);
	}
});

const itLive = (name: string, fn: () => Promise<void>, timeout = 60_000) =>
	test(name, async () => {
		if (!reachable) return;
		await fn();
	}, timeout);

describe('Matrix against a live homeserver', () => {
	itLive('signs in through the real login flow and revokes the token on logout', async () => {
		const creds = await register('login');
		const username = creds.user_id.slice(1).split(':')[0]!;

		const session = await MatrixAuthClient.login(HOMESERVER, username, 'integration-pass-123');
		expect(session.userId).toBe(creds.user_id);
		expect(session.accessToken.length).toBeGreaterThan(0);
		expect(session.deviceId).toBeTruthy();

		// The token works before logout and is rejected afterwards, which is what the store relies on
		// to tell an expired session from a network failure.
		await api('/_matrix/client/v3/account/whoami', { method: 'GET', token: session.accessToken });
		await new MatrixAuthClient(session).logout();
		await expect(
			api('/_matrix/client/v3/account/whoami', { method: 'GET', token: session.accessToken }),
		).rejects.toMatchObject({ isAuthenticationFailure: true });
	});

	itLive('discovers the homeserver from what a person would type', async () => {
		expect(await discoverHomeserver('127.0.0.1:8008')).toBe(HOMESERVER);
	});

	itLive('builds a timeline from real events, with edits, reactions, replies and redactions', async () => {
		const alice = await register('alice');
		const bob = await register('bob');

		const room = await api<{ room_id: string }>('/_matrix/client/v3/createRoom', {
			method: 'POST',
			token: alice.access_token,
			body: JSON.stringify({ preset: 'trusted_private_chat', invite: [bob.user_id], is_direct: true }),
		});
		expect(room.room_id.startsWith(ROOM_ID_PREFIX)).toBe(true);
		await api(`/_matrix/client/v3/rooms/${encodeURIComponent(room.room_id)}/join`, { method: 'POST', token: bob.access_token, body: '{}' });

		const kept = await send(alice, room.room_id, { msgtype: 'm.text', body: 'first' });
		const edited = await send(alice, room.room_id, { msgtype: 'm.text', body: 'to be edited' });
		const doomed = await send(bob, room.room_id, { msgtype: 'm.text', body: 'to be removed' });

		await send(alice, room.room_id, {
			msgtype: 'm.text',
			body: '* edited',
			'm.new_content': { msgtype: 'm.text', body: 'edited' },
			'm.relates_to': { rel_type: 'm.replace', event_id: edited },
		});
		await send(bob, room.room_id, {
			'm.relates_to': { rel_type: 'm.annotation', event_id: kept, key: '👍' },
		}, 'm.reaction');
		await send(bob, room.room_id, {
			msgtype: 'm.text',
			body: '> <@alice> first\n\nreplying',
			'm.relates_to': { 'm.in_reply_to': { event_id: kept } },
		});
		await api(
			`/_matrix/client/v3/rooms/${encodeURIComponent(room.room_id)}/redact/${encodeURIComponent(doomed)}/${Date.now()}`,
			{ method: 'PUT', token: bob.access_token, body: '{}' },
		);

		// Everything above goes through the store exactly as the app would receive it.
		const store = new RoomEventStore();
		const synced = await syncOnce(alice);
		const events = synced.rooms?.join?.[room.room_id]?.timeline?.events ?? [];
		expect(events.length).toBeGreaterThan(0);
		store.record(room.room_id, events);

		const timeline = deriveTimeline(store.get(room.room_id), alice.user_id);
		const byId = new Map(timeline.map(message => [message.eventId, message]));

		expect(byId.get(kept)?.body).toBe('first');
		expect(byId.get(kept)?.own).toBe(true);
		expect(byId.get(kept)?.reactions).toEqual([{ key: '👍', count: 1, mine: false }]);

		expect(byId.get(edited)?.body).toBe('edited');
		expect(byId.get(edited)?.edited).toBe(true);
		// The edit is folded in, never shown as a message of its own.
		expect(timeline.filter(message => message.body === '* edited')).toHaveLength(0);

		expect(byId.get(doomed)?.redacted).toBe(true);

		const reply = timeline.find(message => message.replyTo != null);
		expect(reply?.replyTo?.eventId).toBe(kept);
		// The quoted fallback is stripped, so the quote is not rendered twice.
		expect(reply?.body).toBe('replying');
	});

	itLive('never shows the same event twice across repeated syncs', async () => {
		const alice = await register('dupe');
		const room = await api<{ room_id: string }>('/_matrix/client/v3/createRoom', {
			method: 'POST', token: alice.access_token, body: JSON.stringify({ preset: 'private_chat' }),
		});

		for (let i = 0; i < 5; i++) await send(alice, room.room_id, { msgtype: 'm.text', body: `message ${i}` });

		const store = new RoomEventStore();
		// The same events are replayed the way the SDK snapshot does, plus a fresh incremental sync.
		const first = await syncOnce(alice);
		const firstEvents = first.rooms?.join?.[room.room_id]?.timeline?.events ?? [];
		store.record(room.room_id, firstEvents);
		store.record(room.room_id, firstEvents);
		store.record(room.room_id, [...firstEvents].reverse());

		await send(alice, room.room_id, { msgtype: 'm.text', body: 'message 5' });
		const second = await syncOnce(alice, first.next_batch);
		store.record(room.room_id, second.rooms?.join?.[room.room_id]?.timeline?.events ?? []);

		const timeline = deriveTimeline(store.get(room.room_id), alice.user_id);
		const bodies = timeline.map(message => message.body);
		expect(new Set(bodies).size).toBe(bodies.length);
		expect(bodies).toEqual(['message 0', 'message 1', 'message 2', 'message 3', 'message 4', 'message 5']);
	});

	itLive('reads history back past the live event cap', async () => {
		const alice = await register('history');
		const room = await api<{ room_id: string }>('/_matrix/client/v3/createRoom', {
			method: 'POST', token: alice.access_token, body: JSON.stringify({ preset: 'private_chat' }),
		});

		const total = 24;
		for (let i = 0; i < total; i++) await send(alice, room.room_id, { msgtype: 'm.text', body: `line ${i}` });

		// Only the tail arrives through sync; the rest has to be paginated for.
		const synced = await api<{
			rooms?: { join?: Record<string, { timeline?: { events?: MatrixEvent[]; prev_batch?: string } }> };
		}>(`/_matrix/client/v3/sync?${new URLSearchParams({ timeout: '0', filter: JSON.stringify({ room: { timeline: { limit: 5 } } }) })}`,
			{ method: 'GET', token: alice.access_token });

		const timelineSection = synced.rooms?.join?.[room.room_id]?.timeline;
		const live = timelineSection?.events ?? [];
		const prevBatch = timelineSection?.prev_batch;
		expect(prevBatch).toBeTruthy();

		const store = new RoomEventStore();
		store.record(room.room_id, live);
		const beforeCount = deriveTimeline(store.get(room.room_id), alice.user_id).length;

		const page = await api<{ chunk?: MatrixEvent[]; end?: string }>(
			`/_matrix/client/v3/rooms/${encodeURIComponent(room.room_id)}/messages?${new URLSearchParams({ dir: 'b', from: prevBatch!, limit: '50' })}`,
			{ method: 'GET', token: alice.access_token },
		);
		expect((page.chunk ?? []).length).toBeGreaterThan(0);
		store.record(room.room_id, page.chunk ?? [], { backfill: true });

		const bodies = deriveTimeline(store.get(room.room_id), alice.user_id).map(message => message.body);
		expect(bodies.length).toBeGreaterThan(beforeCount);
		// Paginated history is kept and stays in order alongside what sync delivered.
		expect(bodies).toContain('line 0');
		expect(bodies).toContain(`line ${total - 1}`);
		expect(bodies).toEqual([...bodies].sort((a, b) => Number(a.split(' ')[1]) - Number(b.split(' ')[1])));
	});

	// The placeholder shown while a message is in flight is keyed by the transaction id it was sent
	// under, so the homeserver's echo of that id identifies which placeholder to drop. Without it a
	// sync that beat the send call showed the message twice.
	itLive('echoes back the transaction id a message was sent under', async () => {
		const alice = await register('txn');
		const room = await api<{ room_id: string }>('/_matrix/client/v3/createRoom', {
			method: 'POST', token: alice.access_token, body: JSON.stringify({ preset: 'private_chat' }),
		});

		const txn = `m${Date.now()}.${Math.random().toString(36).slice(2)}`;
		const eventId = await api<{ event_id: string }>(
			`/_matrix/client/v3/rooms/${encodeURIComponent(room.room_id)}/send/m.room.message/${encodeURIComponent(txn)}`,
			{ method: 'PUT', token: alice.access_token, body: JSON.stringify({ msgtype: 'm.text', body: 'echoed' }) },
		).then(result => result.event_id);

		const synced = await syncOnce(alice);
		const events = synced.rooms?.join?.[room.room_id]?.timeline?.events ?? [];
		const mine = events.find(event => event.event_id === eventId);
		expect(mine?.unsigned?.transaction_id).toBe(txn);
	});

	// `is_direct` only flags the invite. What makes a room a direct message for this account, in this
	// and every other client, is its presence in `m.direct` account data.
	itLive('records a new direct conversation in m.direct', async () => {
		const alice = await register('direct');
		const bob = await register('peer');

		const room = await api<{ room_id: string }>('/_matrix/client/v3/createRoom', {
			method: 'POST',
			token: alice.access_token,
			body: JSON.stringify({ preset: 'trusted_private_chat', invite: [bob.user_id], is_direct: true }),
		});

		// Creating the room does not write it; the client has to, which is what the runtime now does.
		const before = await api<Record<string, string[]>>(
			`/_matrix/client/v3/user/${encodeURIComponent(alice.user_id)}/account_data/m.direct`,
			{ method: 'GET', token: alice.access_token },
		).catch(() => ({} as Record<string, string[]>));
		expect(before[bob.user_id] ?? []).not.toContain(room.room_id);

		await api(`/_matrix/client/v3/user/${encodeURIComponent(alice.user_id)}/account_data/m.direct`, {
			method: 'PUT',
			token: alice.access_token,
			body: JSON.stringify({ ...before, [bob.user_id]: [room.room_id] }),
		});

		const after = await api<Record<string, string[]>>(
			`/_matrix/client/v3/user/${encodeURIComponent(alice.user_id)}/account_data/m.direct`,
			{ method: 'GET', token: alice.access_token },
		);
		expect(after[bob.user_id]).toContain(room.room_id);
	});

	itLive('reports a rejected token as an authentication failure', async () => {
		await expect(
			api('/_matrix/client/v3/account/whoami', { method: 'GET', token: 'syt_not_a_real_token' }),
		).rejects.toMatchObject({ isAuthenticationFailure: true });
	});

	itLive('surfaces a missing room rather than hanging', async () => {
		const alice = await register('missing');
		await expect(
			api(`/_matrix/client/v3/rooms/${encodeURIComponent('!nope:localhost')}/join`, {
				method: 'POST', token: alice.access_token, body: '{}',
			}),
		).rejects.toBeInstanceOf(MatrixApiError);
	});
});
