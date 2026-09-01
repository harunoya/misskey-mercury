/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
import { isMatrixSession, MatrixApiError, MatrixAuthClient, matrixSessionKey, parseMxcUrl, upsertMatrixSession } from './matrix-client.js';
import { RoomEventStore } from './matrix-event-store.js';
import { isEncryptedAttachmentFile } from './matrix-attachment-crypto.js';
import type { MatrixEvent, MatrixInvitedRoom, MatrixJoinedRoom, MatrixSession } from './matrix-client.js';
import type { EncryptedAttachmentFile } from './matrix-attachment-crypto.js';
import type { DeviceSummary, MatrixSdkSession, SasChallenge, SdkRoomSnapshot } from './matrix-sdk-runtime.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

export type { DeviceSummary, SasChallenge };

/**
 * Matrix session and timeline state, shared by every view that shows Matrix conversations.
 *
 * It lives outside the components because the unified direct-message list and the Matrix
 * conversation view both need the same rooms, and neither should own a second sync loop. Syncing is
 * reference counted: it starts when the first view asks for it and stops when the last one goes
 * away, so nothing keeps long-polling once the user leaves chat.
 *
 * Events are kept as the homeserver sent them and the timeline is derived from them. Edits,
 * redactions and reactions all refer to an event that may not have arrived yet — a reaction read
 * from history usually shows up before the message it belongs to — so applying them to a
 * pre-rendered list means handling every ordering by hand. Rebuilding from the raw events makes the
 * result the same whichever order they came in.
 *
 * The retention rules for those raw events live in {@link RoomEventStore}.
 */

export type MatrixRoomSummary = {
	roomId: string;
	name: string;
	topic?: string;
	avatarUrl?: string;
	encrypted: boolean;
	unreadCount: number;
	/** Timestamp of the most recent message, for interleaving with Misskey conversations. */
	lastActivityAt: number;
	lastMessage?: string;
	/** In this account's `m.direct`, so it is a conversation with a person rather than a room. */
	direct: boolean;
};

export type MatrixInvite = {
	roomId: string;
	name: string;
	inviter: string;
};

export type MatrixMember = {
	userId: string;
	displayName: string;
	avatarUrl?: string;
};

export type MatrixAttachment = {
	mxcUrl: string;
	fileName: string;
	mimeType?: string;
	size?: number;
	width?: number;
	height?: number;
	/** Present on video and audio, in milliseconds. */
	duration?: number;
	/** Ciphertext metadata for an encrypted attachment. */
	encryptedFile?: EncryptedAttachmentFile;
};

export type MatrixReaction = {
	key: string;
	count: number;
	/** Whether this account is one of the reactors, so the button can render as pressed. */
	mine: boolean;
	/** Our own reaction event, needed to take it back. */
	ownEventId?: string;
};

export type MatrixMessageKind = 'text' | 'emote' | 'notice' | 'image' | 'video' | 'audio' | 'file';

/** The message a reply points at, as much of it as the timeline still holds. */
export type MatrixReplyTarget = {
	eventId: string;
	senderName: string;
	body: string;
};

export type MatrixMessage = {
	eventId: string;
	sender: string;
	senderName: string;
	senderAvatarUrl?: string;
	kind: MatrixMessageKind;
	body: string;
	attachment?: MatrixAttachment;
	timestamp: number;
	own: boolean;
	edited: boolean;
	redacted: boolean;
	reactions: MatrixReaction[];
	replyTo?: MatrixReplyTarget;
	/** Not yet acknowledged by the homeserver, or rejected by it. */
	pending?: boolean;
	failed?: boolean;
	/** Encrypted event that could not be decrypted with the keys this device has. */
	undecryptable?: boolean;
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
export const members = ref<Record<string, Record<string, MatrixMember>>>({});
export const typing = ref<Record<string, string[]>>({});
export const initialSync = ref(false);
export const connectionError = ref<string | null>(null);
export const sessionExpired = ref(false);
/** Rooms with history left to read, and whether a page is being fetched right now. */
export const hasMoreHistory = ref<Record<string, boolean>>({});
export const loadingHistory = ref<Record<string, boolean>>({});
/** True when IndexedDB (or rust crypto init) is missing, so encrypted rooms cannot be used. */
export const cryptoUnavailable = ref(false);
export const unverifiedDeviceCount = ref(0);
export const secretStorageReady = ref(false);
export const sasChallenge = ref<SasChallenge | null>(null);

export const isSignedIn = computed(() => session.value != null);

let sdkSession: MatrixSdkSession | null = null;
let subscribers = 0;
let pendingRoomIdToSelect: string | null = null;
const latestTimelineEventIds = new Map<string, string>();
const roomEventStore = new RoomEventStore();

function persistSessions() {
	miLocalStorage.setItemAsJson('matrixSessions', sessions.value);
	miLocalStorage.removeItem('matrixSession');
}

function describeError(prefix: string, error: unknown): string {
	return error instanceof Error && error.message ? `${prefix} (${error.message})` : prefix;
}

function resetRuntime() {
	initialSync.value = false;
	rooms.value = [];
	invites.value = [];
	messages.value = {};
	members.value = {};
	typing.value = {};
	hasMoreHistory.value = {};
	loadingHistory.value = {};
	pendingRoomIdToSelect = null;
	latestTimelineEventIds.clear();
	roomEventStore.clear();
	clearTypingTimers();
	releaseAllMedia();
	connectionError.value = null;
	cryptoUnavailable.value = false;
	unverifiedDeviceCount.value = 0;
	secretStorageReady.value = false;
	sasChallenge.value = null;
	pendingSends.clear();
	cancelIdleTimer();
	stopSessionRuntime();
}

// ---------------------------------------------------------------- event store

function relatesTo(event: MatrixEvent): { rel_type?: string; event_id?: string; key?: string } | null {
	const relation = event.content?.['m.relates_to'];
	return relation != null && typeof relation === 'object' ? relation as Record<string, string> : null;
}

/**
 * The event a reply answers.
 *
 * A reply is not a `rel_type`: it is the nested `m.in_reply_to` object, which is why it survives
 * alongside an edit's `m.replace` on the same message.
 */
function inReplyToId(event: MatrixEvent): string | undefined {
	const relation = event.content?.['m.relates_to'];
	if (relation == null || typeof relation !== 'object') return undefined;
	const target = (relation as Record<string, unknown>)['m.in_reply_to'];
	if (target == null || typeof target !== 'object') return undefined;
	const eventId = (target as Record<string, unknown>).event_id;
	return typeof eventId === 'string' ? eventId : undefined;
}

/**
 * Strips the quoted fallback that clients prepend to a reply's body.
 *
 * The convention is that every quoted line starts with `> `, followed by a blank line and then the
 * actual reply. Rendering it verbatim would show the quote twice, since the quoted message is also
 * displayed above.
 */
function stripReplyFallback(body: string): string {
	if (!body.startsWith('> ')) return body;
	const lines = body.split('\n');
	let index = 0;
	while (index < lines.length && lines[index]!.startsWith('>')) index++;
	while (index < lines.length && lines[index]!.trim() === '') index++;
	const stripped = lines.slice(index).join('\n');
	return stripped.length > 0 ? stripped : body;
}

const attachmentKinds: Record<string, MatrixMessageKind> = {
	'm.image': 'image',
	'm.video': 'video',
	'm.audio': 'audio',
	'm.file': 'file',
};

function toAttachment(content: Record<string, unknown>, fallbackName: string): MatrixAttachment | undefined {
	const encryptedFile = isEncryptedAttachmentFile(content.file) ? content.file : undefined;
	const url = typeof content.url === 'string' ? content.url : encryptedFile?.url;
	if (parseMxcUrl(url) == null) return undefined;
	const info = content.info != null && typeof content.info === 'object' ? content.info as Record<string, unknown> : {};
	const numberOr = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

	return {
		mxcUrl: url as string,
		fileName: typeof content.body === 'string' && content.body.length > 0 ? content.body : fallbackName,
		mimeType: typeof info.mimetype === 'string' ? info.mimetype : undefined,
		size: numberOr(info.size),
		width: numberOr(info.w),
		height: numberOr(info.h),
		duration: numberOr(info.duration),
		encryptedFile,
	};
}

function replyTargetOf(
	event: MatrixEvent,
	quotable: Map<string, { sender: string; body: string }>,
	roomMembers: Record<string, MatrixMember>,
	redactedIds: Set<string>,
): MatrixReplyTarget | undefined {
	const targetId = inReplyToId(event);
	if (targetId == null) return undefined;
	const target = quotable.get(targetId);
	// The quoted message may be older than what is held, or since deleted; say so rather than
	// dropping the fact that this is a reply.
	if (target == null) return { eventId: targetId, senderName: '', body: i18n.ts._matrix.replyUnavailable };
	if (redactedIds.has(targetId)) return { eventId: targetId, senderName: '', body: i18n.ts._matrix.messageDeleted };
	return {
		eventId: targetId,
		senderName: roomMembers[target.sender]?.displayName ?? target.sender,
		body: target.body,
	};
}

/**
 * Derives the visible timeline from the raw events of a room.
 *
 * Runs over every held event on each change. That is deliberate: it is bounded by
 * {@link MAX_TOTAL_EVENTS_PER_ROOM} and it makes the result independent of arrival order, which
 * relations otherwise are not. Pure, so the relation handling can be tested on its own.
 */
export function deriveTimeline(
	events: MatrixEvent[],
	ownUserId: string | undefined,
	roomMembers: Record<string, MatrixMember> = {},
): MatrixMessage[] {
	const redactedIds = new Set<string>();
	const edits = new Map<string, { body: string; timestamp: number }>();
	const reactionsByTarget = new Map<string, Map<string, MatrixReaction>>();
	/** target event -> reaction key -> everyone already counted for it. */
	const reactorsByTargetAndKey = new Map<string, Map<string, Set<string>>>();

	for (const event of events) {
		if (event.type === 'm.room.redaction' && typeof event.redacts === 'string') redactedIds.add(event.redacts);
	}

	for (const event of events) {
		if (event.event_id != null && redactedIds.has(event.event_id)) continue;
		const relation = relatesTo(event);
		if (relation == null || relation.event_id == null) continue;

		if (event.type === 'm.room.message' && relation.rel_type === 'm.replace') {
			const replacement = event.content?.['m.new_content'];
			const body = replacement != null && typeof replacement === 'object'
				? (replacement as Record<string, unknown>).body
				: undefined;
			if (typeof body !== 'string') continue;
			const previous = edits.get(relation.event_id);
			const timestamp = event.origin_server_ts ?? 0;
			// Several clients can edit the same message; the last edit wins.
			if (previous == null || previous.timestamp <= timestamp) edits.set(relation.event_id, { body, timestamp });
			continue;
		}

		if (event.type === 'm.reaction' && relation.rel_type === 'm.annotation' && typeof relation.key === 'string') {
			// One reaction per person per key. The same annotation can legitimately arrive under two
			// event ids — a client that retried, or the same account reacting from a second device —
			// and counting both made the tally disagree with what every other Matrix client shows.
			const reactors = reactorsByTargetAndKey.get(relation.event_id) ?? new Map<string, Set<string>>();
			const forKey = reactors.get(relation.key) ?? new Set<string>();
			if (event.sender == null || forKey.has(event.sender)) continue;
			forKey.add(event.sender);
			reactors.set(relation.key, forKey);
			reactorsByTargetAndKey.set(relation.event_id, reactors);

			const perTarget = reactionsByTarget.get(relation.event_id) ?? new Map<string, MatrixReaction>();
			const current = perTarget.get(relation.key) ?? { key: relation.key, count: 0, mine: false };
			current.count++;
			if (event.sender === ownUserId) {
				current.mine = true;
				current.ownEventId = event.event_id;
			}
			perTarget.set(relation.key, current);
			reactionsByTarget.set(relation.event_id, perTarget);
		}
	}

	// Bodies of everything that could be replied to, so a reply can quote it without a second pass.
	const quotable = new Map<string, { sender: string; body: string }>();
	for (const event of events) {
		if (event.type !== 'm.room.message' || typeof event.event_id !== 'string' || typeof event.sender !== 'string') continue;
		const body = event.content?.body;
		if (typeof body === 'string') quotable.set(event.event_id, { sender: event.sender, body: stripReplyFallback(body) });
	}

	const timeline: MatrixMessage[] = [];
	for (const event of events) {
		if (event.type !== 'm.room.message' || typeof event.event_id !== 'string' || typeof event.sender !== 'string') continue;
		// An edit is folded into the message it replaces rather than shown as one of its own.
		if (relatesTo(event)?.rel_type === 'm.replace') continue;

		const content = event.content ?? {};
		const undecryptable = content['m.undecryptable'] === true;
		const msgtype = typeof content.msgtype === 'string' ? content.msgtype : 'm.text';
		const kind = attachmentKinds[msgtype] ?? (msgtype === 'm.emote' ? 'emote' : msgtype === 'm.notice' ? 'notice' : 'text');
		const redacted = redactedIds.has(event.event_id);
		const edit = edits.get(event.event_id);
		const member = roomMembers[event.sender];

		timeline.push({
			eventId: event.event_id,
			sender: event.sender,
			senderName: member?.displayName ?? event.sender,
			senderAvatarUrl: member?.avatarUrl,
			kind,
			body: redacted
				? i18n.ts._matrix.messageDeleted
				: undecryptable
					? i18n.ts._matrix.undecryptableMessage
					: edit?.body ?? (typeof content.body === 'string' ? stripReplyFallback(content.body) : ''),
			attachment: redacted || undecryptable ? undefined : toAttachment(content, i18n.ts._matrix.attachment),
			timestamp: event.origin_server_ts ?? Date.now(),
			own: event.sender === ownUserId,
			edited: !redacted && edit != null,
			redacted,
			replyTo: redacted ? undefined : replyTargetOf(event, quotable, roomMembers, redactedIds),
			undecryptable,
			reactions: redacted ? [] : [...(reactionsByTarget.get(event.event_id)?.values() ?? [])].sort((a, b) => b.count - a.count),
		});
	}

	return timeline;
}

function rebuildTimeline(roomId: string) {
	const events = roomEventStore.get(roomId);
	const timeline = deriveTimeline(events, session.value?.userId, members.value[roomId] ?? {});

	// Transaction ids of our own messages the homeserver has now echoed back. A placeholder whose id
	// is in here has been superseded by the real event, so keeping it would show the message twice —
	// which is what happened whenever a sync arrived before the send call returned.
	const confirmed = new Set<string>();
	for (const event of events) {
		const transactionId = event.unsigned?.transaction_id;
		if (typeof transactionId === 'string') confirmed.add(transactionId);
	}

	const local = (messages.value[roomId] ?? []).filter(message => {
		if (message.pending !== true && message.failed !== true) return false;
		return !confirmed.has(message.eventId);
	});
	for (const message of messages.value[roomId] ?? []) {
		if (message.pending === true && confirmed.has(message.eventId)) pendingSends.delete(message.eventId);
	}

	messages.value = { ...messages.value, [roomId]: [...timeline, ...local] };
}

// ---------------------------------------------------------------- sync

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

/** Folds `m.room.member` state into the per-room directory the timeline reads names and avatars from. */
function recordMembers(roomId: string, events: MatrixEvent[]) {
	const known = { ...(members.value[roomId] ?? {}) };
	let changed = false;

	for (const event of events) {
		if (event.type !== 'm.room.member' || typeof event.state_key !== 'string') continue;
		const content = event.content ?? {};
		if (content.membership !== 'join' && content.membership !== 'invite') continue;
		const displayName = typeof content.displayname === 'string' && content.displayname.length > 0
			? content.displayname
			: event.state_key;
		const avatarUrl = parseMxcUrl(content.avatar_url) != null ? content.avatar_url as string : undefined;
		const previous = known[event.state_key];
		if (previous?.displayName === displayName && previous.avatarUrl === avatarUrl) continue;
		known[event.state_key] = { userId: event.state_key, displayName, avatarUrl };
		changed = true;
	}

	if (changed) members.value = { ...members.value, [roomId]: known };
	return changed;
}

function recordTyping(roomId: string, events: MatrixEvent[]) {
	const event = events.find(item => item.type === 'm.typing');
	if (event == null) return;
	const userIds = event.content?.user_ids;
	const others = Array.isArray(userIds)
		? userIds.filter((id): id is string => typeof id === 'string' && id !== session.value?.userId)
		: [];
	typing.value = { ...typing.value, [roomId]: others };
}

function applySync(
	joinedRooms: Record<string, MatrixJoinedRoom>,
	invitedRooms: Record<string, MatrixInvitedRoom>,
	leftRoomIds: string[],
	/** Set when this snapshot was produced by reading history, so retention can keep that page. */
	backfilledRoomId?: string,
	directRoomIds: ReadonlySet<string> = new Set(),
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
		// Every per-room map has to be cleared together. Leaving any of them behind kept a left room's
		// members and "loading history" flag alive for the rest of the session, and rejoining then
		// started from that stale state.
		const nextMessages = { ...messages.value };
		const nextMembers = { ...members.value };
		const nextTyping = { ...typing.value };
		const nextHasMore = { ...hasMoreHistory.value };
		const nextLoading = { ...loadingHistory.value };
		for (const roomId of leftRoomIds) {
			delete nextMessages[roomId];
			delete nextMembers[roomId];
			delete nextTyping[roomId];
			delete nextHasMore[roomId];
			delete nextLoading[roomId];
			latestTimelineEventIds.delete(roomId);
			roomEventStore.forget(roomId);
			clearTypingTimer(roomId);
		}
		messages.value = nextMessages;
		members.value = nextMembers;
		typing.value = nextTyping;
		hasMoreHistory.value = nextHasMore;
		loadingHistory.value = nextLoading;
	}

	for (const [roomId, joinedRoom] of Object.entries(joinedRooms)) {
		const previousRoom = rooms.value.find(room => room.roomId === roomId);
		const stateEvents = joinedRoom.state?.events ?? [];
		const timelineEvents = joinedRoom.timeline?.events ?? [];
		const events = [...stateEvents, ...timelineEvents];

		const latestTimelineEventId = timelineEvents.findLast(event => typeof event.event_id === 'string')?.event_id;
		if (latestTimelineEventId) latestTimelineEventIds.set(roomId, latestTimelineEventId);

		const membersChanged = recordMembers(roomId, events);
		recordTyping(roomId, joinedRoom.ephemeral?.events ?? []);
		const eventsChanged = roomEventStore.record(roomId, timelineEvents, { backfill: roomId === backfilledRoomId });
		if (eventsChanged || membersChanged) rebuildTimeline(roomId);

		// Read every time rather than only on the room's first sync. The token here is the SDK live
		// timeline's backward token, which only ever moves further back as history is read, so re-reading
		// it cannot skip anything — unlike a raw `/sync` `prev_batch`, which this once guarded against.
		const moreOnServer = joinedRoom.timeline?.prev_batch != null;
		const hasMore = moreOnServer && roomEventStore.canHoldMoreHistory(roomId);
		if (hasMoreHistory.value[roomId] !== hasMore) {
			hasMoreHistory.value = { ...hasMoreHistory.value, [roomId]: hasMore };
		}

		const latestMessage = messages.value[roomId]?.at(-1);
		const summary: MatrixRoomSummary = {
			roomId,
			name: findStringContent(events, 'm.room.name', 'name') ?? previousRoom?.name ?? findMemberName(events) ?? roomId,
			topic: findStringContent(events, 'm.room.topic', 'topic') ?? previousRoom?.topic,
			avatarUrl: findStringContent(events, 'm.room.avatar', 'url') ?? previousRoom?.avatarUrl,
			encrypted: previousRoom?.encrypted === true || events.some(event => event.type === 'm.room.encryption'),
			unreadCount: joinedRoom.unread_notifications?.notification_count ?? previousRoom?.unreadCount ?? 0,
			lastActivityAt: latestMessage?.timestamp ?? previousRoom?.lastActivityAt ?? 0,
			lastMessage: latestMessage?.body ?? previousRoom?.lastMessage,
			direct: directRoomIds.has(roomId),
		};

		const index = rooms.value.findIndex(room => room.roomId === roomId);
		if (index === -1) rooms.value.push(summary);
		else rooms.value[index] = summary;
	}

	rooms.value.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads one page further back in a room.
 *
 * Sync only ever delivers what arrived while this client was listening, so without this a
 * conversation looks empty every time the page is reloaded.
 */
export async function loadOlderMessages(roomId: string): Promise<void> {
	if (loadingHistory.value[roomId] === true) return;
	const active = sdkSession;
	if (active == null) return;
	// Refuse rather than fetch a page the event store would immediately drop. Reporting the room as
	// having no more history is what stops the view offering a button that cannot do anything.
	if (!roomEventStore.canHoldMoreHistory(roomId)) {
		hasMoreHistory.value = { ...hasMoreHistory.value, [roomId]: false };
		return;
	}

	loadingHistory.value = { ...loadingHistory.value, [roomId]: true };
	try {
		const page = await active.loadOlder(roomId);
		// No token back, or a page with nothing in it, means the start of the room.
		if (page.end == null || page.chunkLength === 0) {
			hasMoreHistory.value = { ...hasMoreHistory.value, [roomId]: false };
		}
	} finally {
		loadingHistory.value = { ...loadingHistory.value, [roomId]: false };
	}
}

function isAuthenticationFailure(error: unknown): boolean {
	return error instanceof MatrixApiError && error.isAuthenticationFailure;
}

/** Bridges an SDK snapshot into the store's own room/event model. */
function applySdkSnapshot(snapshot: SdkRoomSnapshot) {
	const known = new Set(Object.keys(snapshot.joined));
	// Rooms the client no longer holds have been left, from this store's point of view.
	const left = rooms.value.map(room => room.roomId).filter(id => !known.has(id));
	applySync(snapshot.joined, snapshot.invited, left, snapshot.backfilledRoomId, new Set(snapshot.directRoomIds));
}

/**
 * Session lifecycle.
 *
 * One SDK client per signed-in Matrix account, kept alive for as long as that account is the active
 * one. Views only say whether they need the long poll running; opening a conversation must never
 * build a second client, because that would mean another WASM crypto init, another initial sync,
 * and — worst — two clients holding the same crypto IndexedDB database at once.
 */

/** How long the long poll keeps running after the last view lets go, so navigation does not restart it. */
const SYNC_IDLE_GRACE_MS = 60_000;

/**
 * Serialises teardown against startup. The crypto store is one database per account: a new client
 * must not open it until the previous one has finished letting go.
 */
let teardown: Promise<void> = Promise.resolve();
let starting: Promise<void> | null = null;
let sessionOwnerKey: string | null = null;
let idleTimer: number | null = null;

/**
 * Which session attempt is the current one.
 *
 * Callbacks used to be filtered on {@link sessionOwnerKey}, which is only assigned once startup has
 * finished — so everything a client reported *while starting* was discarded, including the auth
 * failure of an expired token, which left the view waiting on a sync that would never come. This is
 * bumped before a client is built and again whenever one is dropped, so a callback can tell whether
 * it still belongs to the session the store wants at any point in its life.
 */
let sessionGeneration = 0;

function stopSessionRuntime(): void {
	const stopping = sdkSession;
	sdkSession = null;
	sessionOwnerKey = null;
	starting = null;
	// Anything still in flight from the outgoing client is now somebody else's past.
	sessionGeneration++;
	if (stopping == null) return;
	teardown = teardown.then(() => stopping.stop()).catch(() => undefined);
}

function cancelIdleTimer() {
	if (idleTimer != null) {
		window.clearTimeout(idleTimer);
		idleTimer = null;
	}
}

async function ensureSession(): Promise<void> {
	const wanted = session.value;
	if (wanted == null || subscribers === 0) return;
	const wantedKey = matrixSessionKey(wanted);

	// Already running for this account: just make sure the long poll is going again.
	if (sessionOwnerKey === wantedKey && sdkSession != null) {
		sdkSession.resume();
		return;
	}
	if (starting != null) return starting;

	// Claimed before anything is built, so the callbacks below can be filtered from their very first
	// call rather than only once startup finishes.
	const generation = ++sessionGeneration;
	const isCurrent = () => generation === sessionGeneration;

	starting = (async () => {
		// Never overlap with an outgoing session's crypto database.
		await teardown;
		if (!isCurrent() || session.value == null || matrixSessionKey(session.value) !== wantedKey || subscribers === 0) return;

		initialSync.value = true;
		const runtime = await import('./matrix-sdk-runtime.js');
		if (!isCurrent() || session.value == null || matrixSessionKey(session.value) !== wantedKey) return;

		const handle = await runtime.startMatrixSdkSession(wanted, {
			onSync: (snapshot) => {
				if (!isCurrent()) return;
				applySdkSnapshot(snapshot);
				connectionError.value = null;
				initialSync.value = false;
				scheduleCryptoStatusRefresh();
			},
			onAuthFailure: () => {
				if (isCurrent()) discardActiveSession();
			},
			onError: (error) => {
				if (!isCurrent()) return;
				initialSync.value = false;
				if (isAuthenticationFailure(error)) {
					discardActiveSession();
					return;
				}
				connectionError.value = describeError(i18n.ts._matrix.connectionError, error);
			},
		});

		// The account changed while the client was starting; this one is already obsolete.
		if (!isCurrent() || session.value == null || matrixSessionKey(session.value) !== wantedKey) {
			await handle.stop();
			return;
		}

		sdkSession = handle;
		sessionOwnerKey = wantedKey;
		cryptoUnavailable.value = !handle.cryptoEnabled;
		persistSessions();
	})();

	try {
		await starting;
	} catch (error) {
		initialSync.value = false;
		// No plaintext fallback: a client that cannot do crypto would silently turn every encrypted
		// room into an unreadable one, which is worse than saying the connection failed.
		connectionError.value = describeError(i18n.ts._matrix.connectionError, error);
		console.error('[matrix] could not start the session', error);
		stopSessionRuntime();
	} finally {
		if (starting != null) starting = null;
	}
}

/**
 * The running session, or an error. Every action goes through this rather than quietly doing
 * nothing when the client is not up: a send that no-ops looks identical to a send that worked.
 */
function requireSession(): MatrixSdkSession {
	if (sdkSession == null) throw new Error(i18n.ts._matrix.notConnected);
	return sdkSession;
}

/** Starts syncing for as long as at least one view needs it. */
export function acquireSync(): void {
	subscribers++;
	cancelIdleTimer();
	void ensureSession();
}

export function releaseSync(): void {
	subscribers = Math.max(0, subscribers - 1);
	if (subscribers > 0) return;

	// Paused, not torn down. Moving between the conversation list and a conversation drops to zero
	// subscribers for a moment, and rebuilding the client there is exactly what must not happen.
	cancelIdleTimer();
	idleTimer = window.setTimeout(() => {
		idleTimer = null;
		if (subscribers === 0) sdkSession?.pause();
	}, SYNC_IDLE_GRACE_MS);
}

/** Re-reads what the client already holds. Does not rebuild the session. */
export function restartSync(): void {
	if (sdkSession != null) {
		sdkSession.refresh();
		return;
	}
	void ensureSession();
}

/**
 * Device and secret-storage status, refreshed at most once every few seconds.
 *
 * Both are crypto API round trips, and this used to run on every sync callback — which fires per
 * timeline event, so a burst of messages meant a burst of crypto queries whose answers could also
 * land out of order. Nothing here is time critical: it drives an advisory banner.
 */
const CRYPTO_STATUS_INTERVAL_MS = 5_000;
let cryptoStatusRefreshedAt = 0;
let cryptoStatusInFlight = false;

function scheduleCryptoStatusRefresh(): void {
	const now = Date.now();
	if (cryptoStatusInFlight || now - cryptoStatusRefreshedAt < CRYPTO_STATUS_INTERVAL_MS) return;
	cryptoStatusRefreshedAt = now;
	cryptoStatusInFlight = true;
	void refreshCryptoStatus().finally(() => { cryptoStatusInFlight = false; });
}

async function refreshCryptoStatus() {
	const active = sdkSession;
	if (active == null) return;
	try {
		const [unverified, ready] = await Promise.all([
			active.unverifiedDeviceCount(),
			active.isSecretStorageReady(),
		]);
		// The session may have been replaced while these were in flight.
		if (sdkSession !== active) return;
		unverifiedDeviceCount.value = unverified;
		secretStorageReady.value = ready;
	} catch {
		// Status is advisory; a failure here must not tear down the session.
	}
}

// ---------------------------------------------------------------- media

/**
 * Object URLs for media already downloaded, keyed by the mxc URL and the size asked for.
 *
 * Matrix 1.11 put media behind the access token, which an `<img src>` cannot send, so every
 * attachment has to be fetched and handed to the element as a blob. Downloading the same avatar
 * once per message would be wasteful, hence the cache; it is emptied when the session goes away.
 */
const mediaObjectUrls = new Map<string, string>();
const mediaRequests = new Map<string, Promise<string | null>>();

function mediaCacheKey(mxcUrl: string, thumbnail?: { width: number; height: number }): string {
	return thumbnail == null ? mxcUrl : `${mxcUrl} ${thumbnail.width}x${thumbnail.height}`;
}

function releaseAllMedia() {
	for (const url of mediaObjectUrls.values()) URL.revokeObjectURL(url);
	mediaObjectUrls.clear();
	mediaRequests.clear();
}

/**
 * Resolves an `mxc://` URL to something an element can display, or `null` if it cannot be fetched.
 *
 * Downloads of the same media are shared rather than repeated: an avatar appears once per message,
 * and each one would otherwise be its own request.
 */
function encryptedFileFromCache(mxcUrl: string): EncryptedAttachmentFile | undefined {
	for (const list of Object.values(messages.value)) {
		const match = list.find(message => message.attachment?.mxcUrl === mxcUrl)?.attachment?.encryptedFile;
		if (match != null) return match;
	}
	return undefined;
}

export function resolveMediaUrl(mxcUrl: string | undefined, thumbnail?: { width: number; height: number }): Promise<string | null> {
	if (mxcUrl == null || parseMxcUrl(mxcUrl) == null) return Promise.resolve(null);
	const key = mediaCacheKey(mxcUrl, thumbnail);

	const cached = mediaObjectUrls.get(key);
	if (cached != null) return Promise.resolve(cached);

	const inFlight = mediaRequests.get(key);
	if (inFlight != null) return inFlight;

	const activeSdk = sdkSession;
	if (activeSdk == null) return Promise.resolve(null);

	const request = activeSdk.downloadMedia(mxcUrl, thumbnail, encryptedFileFromCache(mxcUrl))
		.then(blob => {
			// The session may have been torn down while this was in flight; a URL created now would
			// never be revoked.
			if (!mediaRequests.has(key)) return null;
			const objectUrl = URL.createObjectURL(blob);
			mediaObjectUrls.set(key, objectUrl);
			return objectUrl;
		})
		.catch((err) => {
			// Reported rather than swallowed: a silent `null` here is indistinguishable from media
			// that simply has not arrived, and the fallback link looks deliberate.
			console.error(`[matrix] could not load ${mxcUrl}`, err);
			// Left out of the cache so a later attempt can retry.
			mediaRequests.delete(key);
			return null;
		});

	mediaRequests.set(key, request);
	return request;
}

// ---------------------------------------------------------------- session

export function activateSession(nextSession: MatrixSession): void {
	resetRuntime();
	sessions.value = upsertMatrixSession(sessions.value, nextSession);
	session.value = nextSession;
	sessionExpired.value = false;
	persistSessions();
	void ensureSession();
}

export async function login(homeserverUrl: string, userId: string, password: string): Promise<void> {
	const newSession = await MatrixAuthClient.login(homeserverUrl, userId, password);
	const replacedSession = sessions.value.find(saved => matrixSessionKey(saved) === matrixSessionKey(newSession));
	activateSession(newSession);
	// The homeserver issues a fresh token per login; the superseded one is ours to clean up.
	if (replacedSession && replacedSession.accessToken !== newSession.accessToken) {
		void new MatrixAuthClient(replacedSession).logout().catch(() => undefined);
	}
}

export async function logout(): Promise<void> {
	const activeSession = session.value;
	if (activeSession == null) return;
	const activeKey = matrixSessionKey(activeSession);
	const remaining = sessions.value.filter(saved => matrixSessionKey(saved) !== activeKey);

	// Taken before the reset: it clears `sdkSession`, and the remote session would then never be
	// invalidated because there would be nothing left to call `logout` on.
	const leaving = sdkSession;
	resetRuntime();
	sessions.value = remaining;
	session.value = null;
	persistSessions();
	if (leaving != null) teardown = teardown.then(() => leaving.logout()).catch(() => undefined);
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

// ---------------------------------------------------------------- sending

/**
 * Shows a message before the homeserver has confirmed it, then lets the synced event take over.
 *
 * The placeholder is kept apart from the derived timeline so a rebuild does not discard it, and it
 * is removed by event id once the real one arrives.
 */
type PendingSend = { kind: 'text'; body: string; replyTo?: MatrixReplyTarget } | { kind: 'file'; file: File };

/** Keyed by the local echo's id, so a failed send can be tried again with the same payload. */
const pendingSends = new Map<string, PendingSend>();

function addLocalEcho(roomId: string, message: MatrixMessage, retryWith: PendingSend) {
	pendingSends.set(message.eventId, retryWith);
	messages.value = { ...messages.value, [roomId]: [...(messages.value[roomId] ?? []), message] };
}

function replaceLocalEcho(roomId: string, localId: string, update: Partial<MatrixMessage> | null) {
	const list = messages.value[roomId] ?? [];
	const next = update == null
		? list.filter(message => message.eventId !== localId)
		: list.map(message => (message.eventId === localId ? { ...message, ...update } : message));
	if (update == null) pendingSends.delete(localId);
	messages.value = { ...messages.value, [roomId]: next };
}

function localEcho(roomId: string, kind: MatrixMessageKind, body: string, attachment?: MatrixAttachment): MatrixMessage | null {
	const ownUserId = session.value?.userId;
	if (ownUserId == null) return null;
	const member = members.value[roomId]?.[ownUserId];
	return {
		// Doubles as the transaction id the message is sent under, so the homeserver's echo of that id
		// identifies exactly which placeholder this event replaces.
		eventId: `m${Date.now()}.${crypto.randomUUID()}`,
		sender: ownUserId,
		senderName: member?.displayName ?? ownUserId,
		senderAvatarUrl: member?.avatarUrl,
		kind,
		body,
		attachment,
		timestamp: Date.now(),
		own: true,
		edited: false,
		redacted: false,
		reactions: [],
		pending: true,
	};
}

export async function sendText(roomId: string, body: string, replyTo?: MatrixReplyTarget): Promise<void> {
	const echo = localEcho(roomId, 'text', body);
	if (echo == null) return;
	if (replyTo != null) echo.replyTo = replyTo;

	addLocalEcho(roomId, echo, { kind: 'text', body, replyTo });
	try {
		await requireSession().sendText(roomId, body, replyTo?.eventId, echo.eventId);
		// The synced event carries the real id and timestamp, so the placeholder just goes away.
		replaceLocalEcho(roomId, echo.eventId, null);
	} catch (error) {
		replaceLocalEcho(roomId, echo.eventId, { pending: false, failed: true });
		throw error;
	}
}

export async function sendFile(roomId: string, file: File): Promise<void> {
	const kind: MatrixMessageKind = file.type.startsWith('image/') ? 'image'
		: file.type.startsWith('video/') ? 'video'
		: file.type.startsWith('audio/') ? 'audio'
		: 'file';
	const echo = localEcho(roomId, kind, file.name);
	if (echo == null) return;

	addLocalEcho(roomId, echo, { kind: 'file', file });
	try {
		await requireSession().sendFile(roomId, file, echo.eventId);
		replaceLocalEcho(roomId, echo.eventId, null);
	} catch (error) {
		replaceLocalEcho(roomId, echo.eventId, { pending: false, failed: true });
		throw error;
	}
}

/**
 * Sends a failed message again, keeping its place in the conversation.
 *
 * The placeholder is reused rather than replaced so the message does not jump to the bottom on
 * every attempt, and the payload comes from {@link pendingSends} because a failed send never
 * produced an event to read it back from.
 */
export async function retrySend(roomId: string, localEventId: string): Promise<void> {
	const payload = pendingSends.get(localEventId);
	if (payload == null) return;

	replaceLocalEcho(roomId, localEventId, { pending: true, failed: false });
	try {
		const active = requireSession();
		if (payload.kind === 'text') await active.sendText(roomId, payload.body, payload.replyTo?.eventId, localEventId);
		else await active.sendFile(roomId, payload.file, localEventId);
		replaceLocalEcho(roomId, localEventId, null);
	} catch (error) {
		replaceLocalEcho(roomId, localEventId, { pending: false, failed: true });
		throw error;
	}
}

/** Drops a failed message without sending it. */
export function discardFailedSend(roomId: string, localEventId: string): void {
	replaceLocalEcho(roomId, localEventId, null);
}

export async function editMessage(roomId: string, eventId: string, body: string): Promise<void> {
	await requireSession().editText(roomId, eventId, body);
}

export async function deleteMessage(roomId: string, eventId: string): Promise<void> {
	await requireSession().redact(roomId, eventId);
}

export async function toggleReaction(roomId: string, eventId: string, key: string): Promise<void> {
	const existing = messages.value[roomId]
		?.find(message => message.eventId === eventId)
		?.reactions.find(reaction => reaction.key === key);

	if (existing?.mine === true && existing.ownEventId != null) {
		// Taking a reaction back is a redaction of the reaction event, not a second reaction.
		await requireSession().redact(roomId, existing.ownEventId);
	} else if (existing?.mine !== true) {
		await requireSession().sendReaction(roomId, eventId, key);
	}
}

/**
 * Throttle timers for the typing notice, one per room.
 *
 * A single shared timer meant the throttle was global: typing in one conversation suppressed the
 * notice in every other one until it expired, and switching rooms mid-throttle left the previous
 * room showing this account as still typing.
 */
const typingTimers = new Map<string, number>();

function clearTypingTimer(roomId: string): void {
	const timer = typingTimers.get(roomId);
	if (timer != null) {
		window.clearTimeout(timer);
		typingTimers.delete(roomId);
	}
}

function clearTypingTimers(): void {
	for (const timer of typingTimers.values()) window.clearTimeout(timer);
	typingTimers.clear();
}

/** Tells the room we are composing, at most once every few seconds. */
export function notifyTyping(roomId: string): void {
	if (typingTimers.has(roomId)) return;
	const active = sdkSession;
	if (active == null) return;

	void active.setTyping(roomId, true).catch(() => undefined);
	typingTimers.set(roomId, window.setTimeout(() => typingTimers.delete(roomId), 5000));
}

export function stopTyping(roomId: string): void {
	clearTypingTimer(roomId);
	if (sdkSession != null) void sdkSession.setTyping(roomId, false).catch(() => undefined);
}

export async function createDirectRoom(userId: string): Promise<string> {
	const active = requireSession();
	const roomId = await active.createDirectRoom(userId);
	// Shown straight away; the sync fills in the real name and members a moment later.
	rooms.value.push({ roomId, name: userId, encrypted: active.cryptoEnabled, unreadCount: 0, lastActivityAt: Date.now(), direct: true });
	return roomId;
}

/** Joins a room the reader typed in, by id or alias. */
export async function joinRoom(roomIdOrAlias: string): Promise<string> {
	const roomId = await requireSession().join(roomIdOrAlias);
	// The conversation opens once the next sync delivers the room.
	pendingRoomIdToSelect = roomId;
	return roomId;
}

export async function respondToInvite(roomId: string, accept: boolean): Promise<void> {
	const active = requireSession();
	if (accept) {
		await active.join(roomId);
		pendingRoomIdToSelect = roomId;
	} else {
		await active.leave(roomId);
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
	// A message the homeserver has not acknowledged yet carries a local id, which it would reject.
	if (latestEventId == null || latestEventId.startsWith('~')) return;
	const room = rooms.value.find(item => item.roomId === roomId);
	if (room) room.unreadCount = 0;
	if (sdkSession != null) void sdkSession.markAsRead(roomId, latestEventId).catch(() => undefined);
}

export async function setupKeyBackup(accountPassword?: string): Promise<string> {
	if (sdkSession == null) throw new Error('Matrix is not connected.');
	const key = await sdkSession.setupKeyBackup(accountPassword);
	secretStorageReady.value = true;
	return key;
}

export async function restoreKeyBackup(recoveryKey: string, accountPassword?: string): Promise<void> {
	if (sdkSession == null) throw new Error('Matrix is not connected.');
	await sdkSession.restoreKeyBackup(recoveryKey, accountPassword);
	secretStorageReady.value = true;
}

/** The devices signed in to this account, with their verification state. */
export async function ownDevices(): Promise<DeviceSummary[]> {
	if (sdkSession == null) return [];
	return await sdkSession.ownDevices();
}

export async function startOwnVerification(): Promise<void> {
	if (sdkSession == null) throw new Error('Matrix is not connected.');
	sasChallenge.value = await sdkSession.startOwnVerification();
}

export function clearSasChallenge(): void {
	sasChallenge.value = null;
}

export function reportError(prefix: string, error: unknown): string {
	return describeError(prefix, error);
}
