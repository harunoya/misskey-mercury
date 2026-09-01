/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type { MatrixEvent } from '@/pages/chat/matrix-client.js';
import { deriveTimeline } from '@/pages/chat/matrix-store.js';

const ME = '@alice:example.com';
const THEM = '@bob:example.com';

let clock = 1_700_000_000_000;

function message(eventId: string, sender: string, content: Record<string, unknown>): MatrixEvent {
	return { type: 'm.room.message', event_id: eventId, sender, origin_server_ts: clock++, content };
}

function text(eventId: string, sender: string, body: string): MatrixEvent {
	return message(eventId, sender, { msgtype: 'm.text', body });
}

describe('deriveTimeline', () => {
	test('keeps only messages, in timestamp order', () => {
		const events = [
			text('$b', THEM, 'second'),
			{ type: 'm.room.member', event_id: '$m', sender: THEM, state_key: THEM, origin_server_ts: 0, content: { membership: 'join' } },
			text('$a', ME, 'first'),
		];
		// The input is deliberately out of order: sync and back-pagination interleave.
		events.sort((a, b) => (a.origin_server_ts ?? 0) - (b.origin_server_ts ?? 0));

		expect(deriveTimeline(events, ME).map(m => m.body)).toEqual(['second', 'first']);
	});

	test('marks our own messages and resolves display names', () => {
		const members = { [THEM]: { userId: THEM, displayName: 'Bob', avatarUrl: 'mxc://example.com/avatar' } };
		const timeline = deriveTimeline([text('$a', ME, 'mine'), text('$b', THEM, 'theirs')], ME, members);

		expect(timeline[0]).toMatchObject({ own: true, senderName: ME });
		expect(timeline[1]).toMatchObject({ own: false, senderName: 'Bob', senderAvatarUrl: 'mxc://example.com/avatar' });
	});

	test('folds an edit into the message it replaces', () => {
		const timeline = deriveTimeline([
			text('$a', ME, 'typo'),
			message('$edit', ME, {
				msgtype: 'm.text',
				body: '* fixed',
				'm.new_content': { msgtype: 'm.text', body: 'fixed' },
				'm.relates_to': { rel_type: 'm.replace', event_id: '$a' },
			}),
		], ME);

		// The edit itself must not appear as a second message.
		expect(timeline).toHaveLength(1);
		expect(timeline[0]).toMatchObject({ eventId: '$a', body: 'fixed', edited: true });
	});

	test('keeps the last edit when there are several', () => {
		const timeline = deriveTimeline([
			text('$a', ME, 'v1'),
			message('$e1', ME, { msgtype: 'm.text', body: '* v2', 'm.new_content': { msgtype: 'm.text', body: 'v2' }, 'm.relates_to': { rel_type: 'm.replace', event_id: '$a' } }),
			message('$e2', ME, { msgtype: 'm.text', body: '* v3', 'm.new_content': { msgtype: 'm.text', body: 'v3' }, 'm.relates_to': { rel_type: 'm.replace', event_id: '$a' } }),
		], ME);

		expect(timeline[0]?.body).toBe('v3');
	});

	test('applies a redaction that arrives before its target', () => {
		// Reading history backwards delivers the newest events first, so this ordering is normal.
		const redaction: MatrixEvent = { type: 'm.room.redaction', event_id: '$r', sender: ME, origin_server_ts: 1, redacts: '$a' };
		const timeline = deriveTimeline([redaction, { ...text('$a', ME, 'oops'), origin_server_ts: 2 }], ME);

		expect(timeline).toHaveLength(1);
		expect(timeline[0]).toMatchObject({ redacted: true, edited: false, reactions: [] });
		expect(timeline[0]?.body).not.toBe('oops');
	});

	test('a redacted message keeps neither its edit nor its attachment', () => {
		const timeline = deriveTimeline([
			message('$a', ME, { msgtype: 'm.image', body: 'cat.png', url: 'mxc://example.com/cat' }),
			message('$e', ME, { msgtype: 'm.text', body: '* x', 'm.new_content': { msgtype: 'm.text', body: 'x' }, 'm.relates_to': { rel_type: 'm.replace', event_id: '$a' } }),
			{ type: 'm.room.redaction', event_id: '$r', sender: ME, origin_server_ts: clock++, redacts: '$a' },
		], ME);

		expect(timeline[0]).toMatchObject({ redacted: true, edited: false, attachment: undefined });
	});

	test('counts reactions and knows which are ours', () => {
		const reaction = (eventId: string, sender: string, key: string): MatrixEvent => ({
			type: 'm.reaction', event_id: eventId, sender, origin_server_ts: clock++,
			content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$a', key } },
		});
		const timeline = deriveTimeline([
			text('$a', THEM, 'hello'),
			reaction('$r1', THEM, '👍'),
			reaction('$r2', ME, '👍'),
			reaction('$r3', THEM, '🎉'),
		], ME);

		expect(timeline).toHaveLength(1);
		// Sorted by count, so the busiest reaction leads.
		expect(timeline[0]?.reactions).toEqual([
			{ key: '👍', count: 2, mine: true, ownEventId: '$r2' },
			{ key: '🎉', count: 1, mine: false },
		]);
	});

	// Two annotation events for the same person and key is not a contradiction: a client that retried
	// or a second device produces exactly that. Counting both made the tally disagree with what every
	// other Matrix client shows for the same room.
	test('counts one reaction per person even when the same annotation arrives twice', () => {
		const reaction = (eventId: string, sender: string, key: string): MatrixEvent => ({
			type: 'm.reaction', event_id: eventId, sender, origin_server_ts: clock++,
			content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$a', key } },
		});
		const timeline = deriveTimeline([
			text('$a', THEM, 'hello'),
			reaction('$r1', ME, '👍'),
			reaction('$r2', ME, '👍'),
			reaction('$r3', THEM, '👍'),
		], ME);

		expect(timeline[0]?.reactions).toEqual([{ key: '👍', count: 2, mine: true, ownEventId: '$r1' }]);
	});

	test('drops a reaction that was itself redacted', () => {
		const timeline = deriveTimeline([
			text('$a', THEM, 'hello'),
			{ type: 'm.reaction', event_id: '$r', sender: ME, origin_server_ts: clock++, content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$a', key: '👍' } } },
			{ type: 'm.room.redaction', event_id: '$x', sender: ME, origin_server_ts: clock++, redacts: '$r' },
		], ME);

		expect(timeline[0]?.reactions).toEqual([]);
	});

	test('reads attachments off media messages', () => {
		const timeline = deriveTimeline([
			message('$a', THEM, {
				msgtype: 'm.image',
				body: 'cat.png',
				url: 'mxc://example.com/cat',
				info: { mimetype: 'image/png', size: 1234, w: 800, h: 600 },
			}),
			message('$b', THEM, { msgtype: 'm.file', body: 'notes.pdf', url: 'mxc://example.com/notes' }),
			message('$c', THEM, { msgtype: 'm.emote', body: 'waves' }),
		], ME);

		expect(timeline.map(m => m.kind)).toEqual(['image', 'file', 'emote']);
		expect(timeline[0]?.attachment).toEqual({
			mxcUrl: 'mxc://example.com/cat',
			fileName: 'cat.png',
			mimeType: 'image/png',
			size: 1234,
			width: 800,
			height: 600,
			duration: undefined,
			encryptedFile: undefined,
		});
	});

	test('keeps an encrypted attachment so it can be decrypted for display', () => {
		const file = {
			url: 'mxc://example.com/secret',
			key: { alg: 'A256CTR', ext: true, k: 'abc', key_ops: ['encrypt', 'decrypt'], kty: 'oct' },
			iv: 'iv',
			hashes: { sha256: 'hash' },
			v: 'v2',
		};
		const timeline = deriveTimeline([
			message('$a', THEM, { msgtype: 'm.image', body: 'secret.png', file }),
		], ME);

		expect(timeline[0]?.attachment).toMatchObject({ mxcUrl: 'mxc://example.com/secret', encryptedFile: file });
	});

	test('resolves the message a reply points at', () => {
		const timeline = deriveTimeline([
			text('$a', THEM, 'the original'),
			message('$b', ME, {
				msgtype: 'm.text',
				// Clients prepend the quote as a fallback for clients without reply support.
				body: '> <@bob:example.com> the original\n\nmy answer',
				'm.relates_to': { 'm.in_reply_to': { event_id: '$a' } },
			}),
		], ME, { [THEM]: { userId: THEM, displayName: 'Bob' } });

		expect(timeline).toHaveLength(2);
		// The fallback quote must not be shown twice: once in the body and once as the quote.
		expect(timeline[1]?.body).toBe('my answer');
		expect(timeline[1]?.replyTo).toEqual({ eventId: '$a', senderName: 'Bob', body: 'the original' });
	});

	test('says so when the quoted message is not held', () => {
		const timeline = deriveTimeline([
			message('$b', ME, { msgtype: 'm.text', body: 'answer', 'm.relates_to': { 'm.in_reply_to': { event_id: '$gone' } } }),
		], ME);

		expect(timeline[0]?.replyTo?.eventId).toBe('$gone');
		expect(timeline[0]?.replyTo?.body.length).toBeGreaterThan(0);
	});

	test('a reply to a deleted message reports the deletion', () => {
		const timeline = deriveTimeline([
			text('$a', THEM, 'gone soon'),
			{ type: 'm.room.redaction', event_id: '$r', sender: THEM, origin_server_ts: clock++, redacts: '$a' },
			message('$b', ME, { msgtype: 'm.text', body: 'answer', 'm.relates_to': { 'm.in_reply_to': { event_id: '$a' } } }),
		], ME);

		const reply = timeline.find(m => m.eventId === '$b');
		expect(reply?.replyTo?.eventId).toBe('$a');
		expect(reply?.replyTo?.body).not.toBe('gone soon');
	});

	test('an edit still applies to a message that is also a reply', () => {
		const timeline = deriveTimeline([
			text('$a', THEM, 'original'),
			message('$b', ME, { msgtype: 'm.text', body: '> quote\n\nfirst', 'm.relates_to': { 'm.in_reply_to': { event_id: '$a' } } }),
			message('$e', ME, { msgtype: 'm.text', body: '* second', 'm.new_content': { msgtype: 'm.text', body: 'second' }, 'm.relates_to': { rel_type: 'm.replace', event_id: '$b' } }),
		], ME);

		const reply = timeline.find(m => m.eventId === '$b');
		expect(reply?.body).toBe('second');
		expect(reply?.edited).toBe(true);
		expect(reply?.replyTo?.eventId).toBe('$a');
	});

	test('a decrypted event replaces the placeholder it arrived as', () => {
		// Decryption is asynchronous: the same event id reaches the timeline first with the
		// "cannot decrypt" marker and again with real content. Treating the second copy as a
		// duplicate left every encrypted message stuck on the placeholder.
		const placeholder = message('$a', THEM, { msgtype: 'm.text', body: '', 'm.undecryptable': true });
		const decrypted = { ...placeholder, content: { msgtype: 'm.text', body: 'the real text' } };

		const before = deriveTimeline([placeholder], ME);
		expect(before[0]?.undecryptable).toBe(true);

		const after = deriveTimeline([decrypted], ME);
		expect(after[0]?.undecryptable).toBeFalsy();
		expect(after[0]?.body).toBe('the real text');
	});

	test('marks an undecryptable event instead of leaving a blank hole', () => {
		const timeline = deriveTimeline([
			message('$a', THEM, { msgtype: 'm.text', body: '', 'm.undecryptable': true }),
		], ME);

		expect(timeline[0]?.undecryptable).toBe(true);
		expect(timeline[0]?.body.length).toBeGreaterThan(0);
		expect(timeline[0]?.attachment).toBeUndefined();
	});
});
