/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type User = Record<string, unknown> & { id: string };

interface CurrentChatMessage extends Record<string, unknown> {
	id: string;
	fromUserId: string;
	fromUser?: User;
	toUserId?: string | null;
	toUser?: User | null;
	toRoomId?: string | null;
	toRoom?: Record<string, unknown> | null;
	isRead?: boolean;
}

/** Maps current chat field names to the names consumed by the original v11 components. */
export function toV11ChatMessage(
	message: CurrentChatMessage,
	me: User,
	otherUser?: User | null,
): CurrentChatMessage & Record<string, unknown> {
	const fromUser = message.fromUser
		?? (message.fromUserId === me.id ? me : otherUser)
		?? { id: message.fromUserId };
	const toUser = message.toUser
		?? (message.toUserId === me.id ? me : otherUser)
		?? (message.toUserId == null ? null : { id: message.toUserId });

	return {
		...message,
		userId: message.fromUserId,
		user: fromUser,
		recipientId: message.toUserId ?? null,
		recipient: toUser,
		groupId: message.toRoomId ?? null,
		group: message.toRoom ?? null,
		// Current chat exposes the conversation read state, not v11's per-member read array.
		reads: message.isRead ? [me.id] : [],
	};
}

export function roomsFromMemberships(memberships: unknown): Record<string, unknown>[] {
	if (!Array.isArray(memberships)) return [];
	return memberships.flatMap(membership => {
		if (typeof membership !== 'object' || membership == null || !('room' in membership)) return [];
		const room = membership.room;
		return typeof room === 'object' && room != null ? [room as Record<string, unknown>] : [];
	});
}
