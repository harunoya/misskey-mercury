/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { normalizeEmojis, normalizeReactions } from './api.js';
import { toV11ChatMessage } from './chat.js';

export interface AdaptedStreamEvent {
	type: string;
	body: unknown;
}

/** Normalizes current streaming payloads and emits only the small set of aliases v11 consumes. */
export function toV11StreamEvents(
	channel: string,
	type: string,
	body: unknown,
	me: Record<string, unknown> & { id: string } | null,
): AdaptedStreamEvent[] {
	normalizeEmojis(body, []);
	normalizeReactions(body);
	if (typeof body === 'object' && body != null && 'hasUnreadChatMessages' in body
		&& !('hasUnreadMessagingMessage' in body)) {
		(body as Record<string, unknown>).hasUnreadMessagingMessage =
			(body as Record<string, unknown>).hasUnreadChatMessages;
	}

	if (channel === 'main' && type === 'newChatMessage' && me != null
		&& typeof body === 'object' && body != null && 'id' in body && 'fromUserId' in body) {
		const message = toV11ChatMessage(body as any, me);
		return [{ type, body: message }];
	}

	return [{ type, body }];
}
