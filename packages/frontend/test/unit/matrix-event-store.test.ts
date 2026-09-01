/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type { MatrixEvent } from '@/pages/chat/matrix-client.js';
import { MAX_LIVE_EVENTS_PER_ROOM, MAX_TOTAL_EVENTS_PER_ROOM, RoomEventStore } from '@/pages/chat/matrix-event-store.js';

const ROOM = '!room:example.com';

function text(eventId: string, ts: number, body = eventId): MatrixEvent {
	return {
		type: 'm.room.message',
		event_id: eventId,
		sender: '@alice:example.com',
		origin_server_ts: ts,
		content: { msgtype: 'm.text', body },
	};
}

/** A run of live events, newest last, as sync would deliver them. */
function liveRun(count: number, startTs = 1_000_000): MatrixEvent[] {
	return Array.from({ length: count }, (_, i) => text(`$live-${i}`, startTs + i));
}

describe('RoomEventStore', () => {
	test('ignores an event it already holds', () => {
		const store = new RoomEventStore();
		expect(store.record(ROOM, [text('$a', 1)])).toBe(true);
		expect(store.record(ROOM, [text('$a', 1)])).toBe(false);
		expect(store.get(ROOM)).toHaveLength(1);
	});

	test('keeps events in timestamp order however they arrive', () => {
		const store = new RoomEventStore();
		store.record(ROOM, [text('$b', 2)]);
		store.record(ROOM, [text('$a', 1)]);
		expect(store.get(ROOM).map(event => event.event_id)).toEqual(['$a', '$b']);
	});

	test('lets a decrypted event replace the placeholder it arrived as', () => {
		const store = new RoomEventStore();
		store.record(ROOM, [{
			type: 'm.room.message',
			event_id: '$secret',
			sender: '@bob:example.com',
			origin_server_ts: 5,
			content: { msgtype: 'm.text', body: '', 'm.undecryptable': true },
		}]);

		expect(store.record(ROOM, [text('$secret', 5, 'now readable')])).toBe(true);
		expect(store.get(ROOM)).toHaveLength(1);
		expect(store.get(ROOM)[0]?.content?.body).toBe('now readable');
	});

	// The bug this covers: trimming drops the oldest events, which is the same end pagination adds
	// to, so a room at the cap discarded every page as it arrived and could never be scrolled back.
	test('keeps backfilled history in a room that is already at the live cap', () => {
		const store = new RoomEventStore();
		store.record(ROOM, liveRun(MAX_LIVE_EVENTS_PER_ROOM));
		expect(store.get(ROOM)).toHaveLength(MAX_LIVE_EVENTS_PER_ROOM);

		const older = [text('$older-1', 1), text('$older-2', 2)];
		expect(store.record(ROOM, older, { backfill: true })).toBe(true);

		const held = store.get(ROOM).map(event => event.event_id);
		expect(held).toContain('$older-1');
		expect(held).toContain('$older-2');
		expect(held.slice(0, 2)).toEqual(['$older-1', '$older-2']);
	});

	test('live events past the cap still drop the oldest', () => {
		const store = new RoomEventStore();
		store.record(ROOM, liveRun(MAX_LIVE_EVENTS_PER_ROOM + 10));
		expect(store.get(ROOM)).toHaveLength(MAX_LIVE_EVENTS_PER_ROOM);
		expect(store.get(ROOM)[0]?.event_id).toBe('$live-10');
	});

	// Dropping an event but keeping its id would make a later redelivery look like a duplicate that
	// can be skipped, and the event would then be lost for good. Trimming has to release the id too.
	test('an event that was trimmed is not mistaken for a duplicate later', () => {
		const store = new RoomEventStore();
		store.record(ROOM, liveRun(MAX_LIVE_EVENTS_PER_ROOM + 1));
		expect(store.get(ROOM).some(event => event.event_id === '$live-0')).toBe(false);

		// Reported as new rather than swallowed, and kept when it comes back as history the reader
		// asked for. Recording it as a live event again would simply trim it away as the oldest.
		expect(store.record(ROOM, [text('$live-0', 1)], { backfill: true })).toBe(true);
		expect(store.get(ROOM).some(event => event.event_id === '$live-0')).toBe(true);
	});

	test('stops offering history once the room reaches its ceiling', () => {
		const store = new RoomEventStore();
		expect(store.canHoldMoreHistory(ROOM)).toBe(true);

		let ts = 0;
		while (store.canHoldMoreHistory(ROOM)) {
			const page = Array.from({ length: 100 }, () => text(`$page-${ts++}`, -ts));
			store.record(ROOM, page, { backfill: true });
		}

		expect(store.get(ROOM).length).toBeLessThanOrEqual(MAX_TOTAL_EVENTS_PER_ROOM);
		expect(store.canHoldMoreHistory(ROOM)).toBe(false);
	});

	test('forgetting a room clears the ids with it', () => {
		const store = new RoomEventStore();
		store.record(ROOM, [text('$a', 1)]);
		store.forget(ROOM);

		expect(store.get(ROOM)).toEqual([]);
		// Re-recording the same id must work; a leftover id set would swallow it.
		expect(store.record(ROOM, [text('$a', 1)])).toBe(true);
	});
});
