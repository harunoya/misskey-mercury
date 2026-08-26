/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
import type { MatrixEvent, MatrixInvitedRoom, MatrixJoinedRoom, MatrixSession } from './matrix-client.js';
import { isMatrixSession, MatrixApiError, MatrixClient, matrixSessionKey, upsertMatrixSession } from './matrix-client.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

/**
 * Matrix session and timeline state, shared by every view that shows Matrix conversations.
 *
 * It lives outside the components because the unified direct-message list and the Matrix
 * conversation view both need the same rooms, and neither should own a second sync loop. Syncing is
 * reference counted: it starts when the first view asks for it and stops when the last one goes
 * away, so nothing keeps long-polling once the user leaves chat.
 */

export type MatrixRoomSummary = {
	roomId: string;
	name: string;
	topic?: string;
	encrypted: boolean;
	unreadCount: number;
	/** Timestamp of the most recent message, for interleaving with Misskey conversations. */
	lastActivityAt: number;
	lastMessage?: string;
};

export type MatrixInvite = {
	roomId: string;
	name: string;
	inviter: string;
};

export type MatrixMessage = {
	eventId: string;
	sender: string;
	body: string;
	timestamp: number;
	own: boolean;
};

function loadStoredSessions(stored: unknown, legacy: unknown): MatrixSession[] {
	const storedCandidates = Array.isArray(stored) ? stored.filter(isMatrixSession) : [];
	const candidates = storedCandidates.length > 0 ? storedCandidates : isMatrixSession(legacy) ? [legacy] : [];
	return candidates.reduce<MatrixSession[]>((result, item) => {
		if (result.some(session => matrixSessionKey(session) === matrixSessionKey(item))) return result;
		result.push(item);
		return result;
	}, []);
}

const initialSessions = loadStoredSessions(
	miLocalStorage.getItemAsJson('matrixSessions'),
	miLocalStorage.getItemAsJson('matrixSession'),
);

export const sessions = ref<MatrixSession[]>(initialSessions);
export const session = ref<MatrixSession | null>(initialSessions[0] ?? null);
export const rooms = ref<MatrixRoomSummary[]>([]);
export const invites = ref<MatrixInvite[]>([]);
export const messages = ref<Record<string, MatrixMessage[]>>({});
export const initialSync = ref(false);
export const connectionError = ref<string | null>(null);
export const sessionExpired = ref(false);

export const isSignedIn = computed(() => session.value != null);

let client: MatrixClient | null = null;
let syncToken: string | undefined;
let syncController: AbortController | null = null;
let subscribers = 0;
let pendingRoomIdToSelect: string | null = null;
const latestTimelineEventIds = new Map<string, string>();

function persistSessions() {
	miLocalStorage.setItemAsJson('matrixSessions', sessions.value);
	miLocalStorage.removeItem('matrixSession');
}

function describeError(prefix: string, error: unknown): string {
	return error instanceof Error && error.message ? `${prefix} (${error.message})` : prefix;
}

function resetRuntime() {
	syncController?.abort();
	syncController = null;
	client = null;
	syncToken = undefined;
	initialSync.value = false;
	rooms.value = [];
	invites.value = [];
	messages.value = {};
	pendingRoomIdToSelect = null;
	latestTimelineEventIds.clear();
	connectionError.value = null;
}

function findStringContent(events: MatrixEvent[], type: string, key: string): string | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		const value = event?.type === type ? event.content?.[key] : undefined;
		if (typeof value === 'string' && value.length > 0) return value;
	}
	return undefined;
}

function findMemberName(events: MatrixEvent[]): string | undefined {
	const event = events.find(item => item.type === 'm.room.member' && item.state_key !== session.value?.userId && item.content?.membership === 'join');
	const displayName = event?.content?.displayname;
	return typeof displayName === 'string' && displayName.length > 0 ? displayName : event?.state_key;
}

function toMessage(event: MatrixEvent): MatrixMessage[] {
	if (event.type !== 'm.room.message' || typeof event.event_id !== 'string' || typeof event.sender !== 'string') return [];
	if (event.content?.msgtype !== 'm.text' && event.content?.msgtype !== 'm.notice') return [];
	if (typeof event.content.body !== 'string') return [];
	return [{
		eventId: event.event_id,
		sender: event.sender,
		body: event.content.body,
		timestamp: event.origin_server_ts ?? Date.now(),
		own: event.sender === session.value?.userId,
	}];
}

function applySync(
	joinedRooms: Record<string, MatrixJoinedRoom>,
	invitedRooms: Record<string, MatrixInvitedRoom>,
	leftRoomIds: string[],
) {
	// A conversation someone else starts arrives here first and only shows up under `join` once it
	// is accepted, so ignoring this section makes every incoming DM invisible.
	invites.value = Object.entries(invitedRooms).map(([roomId, invitedRoom]) => {
		const events = invitedRoom.invite_state?.events ?? [];
		const inviter = events.find(event => event.type === 'm.room.member' && event.content?.membership === 'invite')?.sender;
		return {
			roomId,
			name: findStringContent(events, 'm.room.name', 'name') ?? findMemberName(events) ?? inviter ?? roomId,
			inviter: inviter ?? roomId,
		};
	});

	if (leftRoomIds.length > 0) {
		rooms.value = rooms.value.filter(room => !leftRoomIds.includes(room.roomId));
		for (const roomId of leftRoomIds) {
			delete messages.value[roomId];
			latestTimelineEventIds.delete(roomId);
		}
	}

	for (const [roomId, joinedRoom] of Object.entries(joinedRooms)) {
		const previousRoom = rooms.value.find(room => room.roomId === roomId);
		const events = [...(joinedRoom.state?.events ?? []), ...(joinedRoom.timeline?.events ?? [])];
		const latestTimelineEventId = joinedRoom.timeline?.events?.findLast(event => typeof event.event_id === 'string')?.event_id;
		if (latestTimelineEventId) latestTimelineEventIds.set(roomId, latestTimelineEventId);

		const newMessages = events.flatMap(event => toMessage(event));
		if (newMessages.length > 0) {
			const merged = [...(messages.value[roomId] ?? []), ...newMessages];
			messages.value[roomId] = [...new Map(merged.map(message => [message.eventId, message])).values()]
				.sort((a, b) => a.timestamp - b.timestamp)
				.slice(-300);
		}

		const latestMessage = messages.value[roomId]?.at(-1);
		const summary: MatrixRoomSummary = {
			roomId,
			name: findStringContent(events, 'm.room.name', 'name') ?? previousRoom?.name ?? findMemberName(events) ?? roomId,
			topic: findStringContent(events, 'm.room.topic', 'topic') ?? previousRoom?.topic,
			encrypted: previousRoom?.encrypted === true || events.some(event => event.type === 'm.room.encryption'),
			unreadCount: joinedRoom.unread_notifications?.notification_count ?? previousRoom?.unreadCount ?? 0,
			lastActivityAt: latestMessage?.timestamp ?? previousRoom?.lastActivityAt ?? 0,
			lastMessage: latestMessage?.body ?? previousRoom?.lastMessage,
		};

		const index = rooms.value.findIndex(room => room.roomId === roomId);
		if (index === -1) rooms.value.push(summary);
		else rooms.value[index] = summary;
	}

	rooms.value.sort((a, b) => a.name.localeCompare(b.name));
}

function isAuthenticationFailure(error: unknown): boolean {
	return error instanceof MatrixApiError && error.isAuthenticationFailure;
}

function rateLimitRetryDelay(error: unknown): number | null {
	if (!(error instanceof MatrixApiError) || error.retryAfterMs == null) return null;
	// Trust the homeserver, but do not let a hostile or buggy value stall the client for hours.
	return Math.min(Math.max(error.retryAfterMs, 0), 60000);
}

async function syncLoop(activeClient: MatrixClient, controller: AbortController) {
	let consecutiveFailures = 0;
	while (!controller.signal.aborted && client === activeClient) {
		try {
			const result = await activeClient.sync(syncToken, controller.signal);
			if (controller.signal.aborted || client !== activeClient) return;
			applySync(result.rooms?.join ?? {}, result.rooms?.invite ?? {}, Object.keys(result.rooms?.leave ?? {}));
			syncToken = result.next_batch;
			connectionError.value = null;
			initialSync.value = false;
			consecutiveFailures = 0;
		} catch (error) {
			if (controller.signal.aborted || client !== activeClient) return;
			initialSync.value = false;

			// A rejected token never recovers by waiting, so retrying is pure noise against the
			// homeserver and leaves the user staring at "connection failed" with nothing to do.
			if (isAuthenticationFailure(error)) {
				discardActiveSession();
				return;
			}

			connectionError.value = describeError(i18n.ts._matrix.connectionError, error);
			consecutiveFailures++;
			// Matrix asks clients to wait a specific time when rate limited; otherwise back off so a
			// homeserver that is down is not polled every three seconds indefinitely.
			const retryAfter = rateLimitRetryDelay(error);
			const delay = retryAfter ?? Math.min(3000 * 2 ** (consecutiveFailures - 1), 60000);
			await new Promise(resolve => window.setTimeout(resolve, delay));
		}
	}
}

function startSync() {
	if (session.value == null || subscribers === 0) return;
	syncController?.abort();
	client = new MatrixClient(session.value);
	syncController = new AbortController();
	initialSync.value = true;
	void syncLoop(client, syncController);
}

/** Starts syncing for as long as at least one view needs it. */
export function acquireSync(): void {
	subscribers++;
	if (subscribers === 1 && session.value != null) startSync();
}

export function releaseSync(): void {
	subscribers = Math.max(0, subscribers - 1);
	if (subscribers === 0) {
		syncController?.abort();
		syncController = null;
		client = null;
	}
}

export function restartSync(): void {
	startSync();
}

export function activateSession(nextSession: MatrixSession): void {
	resetRuntime();
	sessions.value = upsertMatrixSession(sessions.value, nextSession);
	session.value = nextSession;
	sessionExpired.value = false;
	persistSessions();
	startSync();
}

export async function login(homeserverUrl: string, userId: string, password: string): Promise<void> {
	const newSession = await MatrixClient.login(homeserverUrl, userId, password);
	const replacedSession = sessions.value.find(saved => matrixSessionKey(saved) === matrixSessionKey(newSession));
	activateSession(newSession);
	// The homeserver issues a fresh token per login; the superseded one is ours to clean up.
	if (replacedSession && replacedSession.accessToken !== newSession.accessToken) {
		void new MatrixClient(replacedSession).logout().catch(() => undefined);
	}
}

export async function logout(): Promise<void> {
	const activeSession = session.value;
	if (activeSession == null) return;
	const activeClient = client;
	const activeKey = matrixSessionKey(activeSession);
	const remaining = sessions.value.filter(saved => matrixSessionKey(saved) !== activeKey);

	resetRuntime();
	sessions.value = remaining;
	session.value = null;
	persistSessions();
	void activeClient?.logout().catch(() => undefined);
	if (remaining[0]) activateSession(remaining[0]);
}

/**
 * Forgets the session whose token the homeserver rejected, leaving the account switcher on whatever
 * else is signed in. The token is already dead, so there is nothing to revoke.
 */
function discardActiveSession() {
	const deadSession = session.value;
	if (deadSession == null) return;
	const deadKey = matrixSessionKey(deadSession);
	const remaining = sessions.value.filter(saved => matrixSessionKey(saved) !== deadKey);

	resetRuntime();
	sessions.value = remaining;
	session.value = null;
	persistSessions();
	sessionExpired.value = true;
	if (remaining[0]) activateSession(remaining[0]);
}

export async function sendText(roomId: string, body: string): Promise<MatrixMessage | null> {
	const activeClient = client;
	const ownUserId = session.value?.userId;
	if (activeClient == null || ownUserId == null) return null;

	const result = await activeClient.sendText(roomId, body);
	const ownMessage: MatrixMessage = {
		eventId: result.event_id,
		sender: ownUserId,
		body,
		timestamp: Date.now(),
		own: true,
	};
	messages.value[roomId] = [...(messages.value[roomId] ?? []), ownMessage];
	return ownMessage;
}

export async function createDirectRoom(userId: string): Promise<string | null> {
	const activeClient = client;
	if (activeClient == null) return null;
	const room = await activeClient.createDirectRoom(userId);
	rooms.value.push({ roomId: room.room_id, name: userId, encrypted: false, unreadCount: 0, lastActivityAt: Date.now() });
	restartSync();
	return room.room_id;
}

export async function respondToInvite(roomId: string, accept: boolean): Promise<void> {
	const activeClient = client;
	if (activeClient == null) return;
	if (accept) {
		await activeClient.joinRoom(roomId);
		pendingRoomIdToSelect = roomId;
	} else {
		await activeClient.leaveRoom(roomId);
	}
	invites.value = invites.value.filter(invite => invite.roomId !== roomId);
}

export function takePendingRoomId(): string | null {
	const roomId = pendingRoomIdToSelect;
	pendingRoomIdToSelect = null;
	return roomId;
}

export function markRoomAsRead(roomId: string): void {
	const latestEventId = latestTimelineEventIds.get(roomId);
	if (client == null || latestEventId == null) return;
	const room = rooms.value.find(item => item.roomId === roomId);
	if (room) room.unreadCount = 0;
	void client.markAsRead(roomId, latestEventId).catch(() => undefined);
}

export function reportError(prefix: string, error: unknown): string {
	return describeError(prefix, error);
}
