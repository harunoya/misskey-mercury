/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface V11RoomInfo {
	roomType: string;
	carpetColor: string;
	furnitures: unknown[];
}

function isRoomInfo(value: unknown): value is V11RoomInfo {
	if (typeof value !== 'object' || value == null) return false;
	const room = value as Partial<V11RoomInfo>;
	return typeof room.roomType === 'string'
		&& typeof room.carpetColor === 'string'
		&& Array.isArray(room.furnitures);
}

export function loadLocalV11Room(userId: string): V11RoomInfo {
	try {
		const stored = localStorage.getItem(`room:${userId}`);
		if (stored != null) {
			const parsed: unknown = JSON.parse(stored);
			if (isRoomInfo(parsed)) return parsed;
		}
	} catch (error) {
		console.warn('[frontend-v11] ignored invalid local room data', error);
	}

	return { roomType: 'default', carpetColor: '#85c9c8', furnitures: [] };
}

export function saveLocalV11Room(userId: string, room: V11RoomInfo): void {
	localStorage.setItem(`room:${userId}`, JSON.stringify(room));
}
