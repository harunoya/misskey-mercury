/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MatrixEvent } from './matrix-client.js';

/**
 * The raw events held per room, from which the visible timeline is derived.
 *
 * Kept apart from the store so the retention rules can be tested on their own: they are the part
 * that decides whether history a reader asked for survives, and getting them wrong is invisible
 * until someone scrolls up in a busy room.
 *
 * Events are merged rather than replaced. The runtime hands over the SDK's whole live timeline on
 * every snapshot, which looks like it would make merging pointless, but a gappy sync makes the SDK
 * start a *new* live timeline and the previous events stop being reported. Replacing on each
 * snapshot would drop the conversation the reader is looking at at exactly that moment.
 */

/** Live events kept per room before the oldest start being dropped. */
export const MAX_LIVE_EVENTS_PER_ROOM = 1000;

/**
 * Hard ceiling per room, including history read by paginating.
 *
 * Trimming drops the oldest events, which is the same end that paginating adds to. Applying a flat
 * cap therefore threw away each page as it arrived, so a room at the cap could never be scrolled
 * back through: "load older" fetched, stored, and immediately discarded. Backfill raises the room's
 * capacity instead, and this ceiling is what keeps that bounded.
 */
export const MAX_TOTAL_EVENTS_PER_ROOM = 5000;

function isUndecryptable(event: MatrixEvent): boolean {
	return event.content?.['m.undecryptable'] === true;
}

/**
 * The key an event is deduplicated on.
 *
 * State events repeat across snapshots and the newest should win, so they are keyed by what they
 * describe rather than by id.
 */
function dedupeKey(event: MatrixEvent): string | null {
	if (event.event_id != null) return event.event_id;
	return event.state_key != null ? `${event.type} ${event.state_key}` : null;
}

export class RoomEventStore {
	private readonly events = new Map<string, MatrixEvent[]>();
	private readonly keys = new Map<string, Set<string>>();
	/** Extra capacity earned by reading history, so pagination is not undone by trimming. */
	private readonly backfillAllowance = new Map<string, number>();

	public get(roomId: string): MatrixEvent[] {
		return this.events.get(roomId) ?? [];
	}

	public forget(roomId: string): void {
		this.events.delete(roomId);
		this.keys.delete(roomId);
		this.backfillAllowance.delete(roomId);
	}

	public clear(): void {
		this.events.clear();
		this.keys.clear();
		this.backfillAllowance.clear();
	}

	/** Whether this room can hold more history, or has reached {@link MAX_TOTAL_EVENTS_PER_ROOM}. */
	public canHoldMoreHistory(roomId: string): boolean {
		return this.capacity(roomId) < MAX_TOTAL_EVENTS_PER_ROOM;
	}

	private capacity(roomId: string): number {
		return Math.min(
			MAX_LIVE_EVENTS_PER_ROOM + (this.backfillAllowance.get(roomId) ?? 0),
			MAX_TOTAL_EVENTS_PER_ROOM,
		);
	}

	/**
	 * Records the events of a room, ignoring ones already held.
	 *
	 * `backfill` marks a page the reader asked for by scrolling up. Those raise the room's capacity;
	 * without that they would be trimmed away as the oldest events the moment they arrived.
	 *
	 * Returns whether anything changed, so a snapshot that only carried a receipt does not rebuild
	 * the timeline for nothing.
	 */
	public record(roomId: string, incoming: MatrixEvent[], options: { backfill?: boolean } = {}): boolean {
		if (incoming.length === 0) return false;
		const held = this.events.get(roomId) ?? [];
		const keys = this.keys.get(roomId) ?? new Set<string>();
		let changed = false;
		let added = 0;

		for (const event of incoming) {
			const key = dedupeKey(event);
			if (key == null) continue;

			if (keys.has(key)) {
				// An encrypted event reaches the timeline before it is decrypted, so the same id comes
				// back a second time with real content. Ignoring the repeat, as a plain dedupe would,
				// leaves every encrypted message stuck on its "cannot decrypt" placeholder.
				const index = held.findIndex(candidate => dedupeKey(candidate) === key);
				if (index !== -1 && isUndecryptable(held[index]!) && !isUndecryptable(event)) {
					held[index] = event;
					changed = true;
				}
				continue;
			}

			keys.add(key);
			held.push(event);
			added++;
			changed = true;
		}

		if (!changed) return false;

		if (options.backfill === true && added > 0) {
			this.backfillAllowance.set(roomId, (this.backfillAllowance.get(roomId) ?? 0) + added);
		}

		held.sort((a, b) => (a.origin_server_ts ?? 0) - (b.origin_server_ts ?? 0));

		const capacity = this.capacity(roomId);
		if (held.length > capacity) {
			for (const dropped of held.splice(0, held.length - capacity)) {
				const key = dedupeKey(dropped);
				// Dropping the event but keeping its key would make a later redelivery look like a
				// duplicate and silently lose it.
				if (key != null) keys.delete(key);
			}
		}

		this.events.set(roomId, held);
		this.keys.set(roomId, keys);
		return true;
	}
}
