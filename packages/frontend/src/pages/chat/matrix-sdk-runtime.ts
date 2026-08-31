/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Dynamically imported Matrix SDK session. Loaded only when a Matrix account is signed in,
 * so opening chat without Matrix does not download the WASM crypto module.
 */

import {
	ClientEvent,
	createClient,
	EventTimeline,
	EventType,
	IndexedDBStore,
	MatrixEventEvent,
	MemoryStore,
	MsgType,
	NotificationCountType,
	RoomEvent,
	SyncState,
} from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent as SdkEvent, Room } from 'matrix-js-sdk';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent.js';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key.js';
import { VerificationRequestEvent, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api/verification.js';
import type { CryptoApi, VerificationRequest } from 'matrix-js-sdk/lib/crypto-api/index.js';
import type { MatrixEvent as StoreEvent, MatrixInvitedRoom, MatrixJoinedRoom, MatrixSession } from './matrix-client.js';
import { MatrixApiError, parseMxcUrl } from './matrix-client.js';
import { decryptAttachment, encryptAttachment, isEncryptedAttachmentFile } from './matrix-attachment-crypto.js';
import type { EncryptedAttachmentFile } from './matrix-attachment-crypto.js';

export type SdkRoomSnapshot = {
	joined: Record<string, MatrixJoinedRoom>;
	invited: Record<string, MatrixInvitedRoom>;
	left: string[];
};

export type SdkSessionCallbacks = {
	onSync: (snapshot: SdkRoomSnapshot) => void;
	onAuthFailure: () => void;
	onError: (error: unknown) => void;
	onVerificationRequest?: (request: VerificationRequest) => void;
};

export type DeviceSummary = {
	deviceId: string;
	displayName: string | null;
	fingerprint: string | null;
	verified: boolean;
	current: boolean;
};

export type SasChallenge = {
	emojis: [string, string][];
	confirm: () => Promise<void>;
	mismatch: () => void;
	cancel: () => void;
};

function storeName(kind: 'sync' | 'crypto', session: MatrixSession): string {
	return `mercury-matrix-${kind}:${session.userId}:${session.deviceId ?? 'nodevice'}`;
}

export async function canUseIndexedDb(): Promise<boolean> {
	if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') return false;
	try {
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('mercury-matrix-idb-probe');
			request.onsuccess = () => {
				request.result.close();
				indexedDB.deleteDatabase('mercury-matrix-idb-probe');
				resolve();
			};
			request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
		});
		return true;
	} catch {
		return false;
	}
}

function toStoreEvent(event: SdkEvent): StoreEvent {
	const undecryptable = event.isEncrypted() && (event.isDecryptionFailure() || event.getClearContent() == null);
	const content = undecryptable
		? { msgtype: 'm.text', body: '', 'm.undecryptable': true }
		: event.getContent();
	const clearType = undecryptable ? 'm.room.message' : event.getType();
	return {
		type: clearType,
		event_id: event.getId(),
		sender: event.getSender() ?? undefined,
		state_key: event.getStateKey(),
		origin_server_ts: event.getTs(),
		content,
		unsigned: event.getUnsigned() as Record<string, unknown> | undefined,
		redacts: (event.event as { redacts?: string }).redacts,
	};
}

function stateEventsOfType(room: Room, type: EventType | string): StoreEvent[] {
	const events = room.currentState.getStateEvents(type as EventType);
	return (Array.isArray(events) ? events : events == null ? [] : [events]).map(toStoreEvent);
}

function snapshotRoom(room: Room): MatrixJoinedRoom {
	const timeline = room.getLiveTimeline();
	// Events the homeserver has not acknowledged carry a local id; the store keeps its own
	// placeholder for those, and a read receipt naming one is rejected.
	const events = timeline.getEvents().filter(event => !(event.getId() ?? '').startsWith('~')).map(toStoreEvent);
	const stateEvents = [
		...stateEventsOfType(room, EventType.RoomName),
		...stateEventsOfType(room, EventType.RoomTopic),
		...stateEventsOfType(room, EventType.RoomAvatar),
		...stateEventsOfType(room, EventType.RoomEncryption),
		...stateEventsOfType(room, EventType.RoomMember),
	];
	const typingIds = room.getMembers().filter(member => member.typing).map(member => member.userId);
	return {
		state: { events: stateEvents },
		timeline: {
			events,
			prev_batch: timeline.getPaginationToken(EventTimeline.BACKWARDS) ?? undefined,
		},
		ephemeral: { events: [{ type: 'm.typing', content: { user_ids: typingIds } }] },
		unread_notifications: { notification_count: room.getUnreadNotificationCount(NotificationCountType.Total) ?? 0 },
	};
}

function snapshotInvited(room: Room): MatrixInvitedRoom {
	return {
		invite_state: {
			events: [
				...stateEventsOfType(room, EventType.RoomName),
				...stateEventsOfType(room, EventType.RoomMember),
				...stateEventsOfType(room, EventType.RoomEncryption),
			],
		},
	};
}

export class MatrixSdkSession {
	public cryptoEnabled = false;
	private client: MatrixClient | null = null;
	private stopped = false;
	private pendingRecoveryKey: Uint8Array | null = null;
	private verificationRequest: VerificationRequest | null = null;

	constructor(
		private readonly session: MatrixSession,
		private readonly callbacks: SdkSessionCallbacks,
	) {}

	public async start(): Promise<void> {
		const deviceId = this.session.deviceId ?? await resolveDeviceId(this.session);
		if (deviceId != null && this.session.deviceId !== deviceId) {
			this.session.deviceId = deviceId;
		}

		const idb = await canUseIndexedDb();
		const store = idb
			? new IndexedDBStore({
				indexedDB,
				dbName: storeName('sync', this.session),
				workerFactory: typeof Worker === 'undefined'
					? undefined
					: () => new Worker(new URL('./matrix-idb.worker.ts', import.meta.url), { type: 'module' }),
			})
			: new MemoryStore();

		const client = createClient({
			baseUrl: this.session.homeserverUrl,
			accessToken: this.session.accessToken,
			userId: this.session.userId,
			deviceId,
			store,
			timelineSupport: true,
			// Bound fetch: passing `window.fetch` as a method hits Illegal invocation.
			fetchFn: (input, init) => globalThis.fetch(input, init),
			cryptoCallbacks: {
				getSecretStorageKey: async ({ keys }) => {
					if (this.pendingRecoveryKey == null) return null;
					const keyId = Object.keys(keys)[0];
					if (keyId == null) return null;
					return [keyId, this.pendingRecoveryKey.slice()] as [string, Uint8Array<ArrayBuffer>];
				},
			},
		});
		this.client = client;

		if ('startup' in store && typeof store.startup === 'function') {
			await store.startup();
		}

		if (idb && deviceId != null) {
			try {
				await client.initRustCrypto({
					useIndexedDB: true,
					cryptoDatabasePrefix: storeName('crypto', this.session),
				});
				this.cryptoEnabled = client.getCrypto() != null;
			} catch (error) {
				console.error('[matrix] rust crypto init failed; encrypted rooms will stay read-only', error);
				this.cryptoEnabled = false;
			}
		}

		const emitSnapshot = () => {
			if (this.stopped) return;
			try {
				this.callbacks.onSync(this.collectSnapshot());
			} catch (error) {
				console.error('[matrix] failed to apply a sync snapshot', error);
				this.callbacks.onError(error);
			}
		};

		client.on(ClientEvent.Sync, (state) => {
			if (this.stopped) return;
			if (state === SyncState.Error) {
				const error = client.getSyncStateData()?.error;
				this.callbacks.onError(error ?? new Error('Matrix sync failed.'));
				return;
			}
			if (state === SyncState.Prepared || state === SyncState.Syncing) {
				emitSnapshot();
			}
		});

		client.on(RoomEvent.Timeline, (event: SdkEvent, room) => {
			if (this.stopped || room == null) return;
			if (event.isEncrypted() && event.getClearContent() == null) {
				event.once(MatrixEventEvent.Decrypted, () => emitSnapshot());
			}
			emitSnapshot();
		});

		client.on(RoomEvent.Receipt, () => emitSnapshot());

		client.on(ClientEvent.Event, (event: SdkEvent) => {
			if (event.getType() === 'm.room.encryption' || event.getType() === EventType.RoomMember) {
				emitSnapshot();
			}
		});

		client.on(CryptoEvent.VerificationRequestReceived, (request: VerificationRequest) => {
			this.callbacks.onVerificationRequest?.(request);
		});

		try {
			await client.startClient({
				initialSyncLimit: 30,
				lazyLoadMembers: true,
			});
		} catch (error) {
			if (isAuthError(error)) this.callbacks.onAuthFailure();
			else throw error;
		}
	}

	public collectSnapshot(): SdkRoomSnapshot {
		const client = this.requireClient();
		const joined: Record<string, MatrixJoinedRoom> = {};
		const invited: Record<string, MatrixInvitedRoom> = {};
		for (const room of client.getRooms()) {
			const membership = room.getMyMembership();
			if (membership === 'invite') invited[room.roomId] = snapshotInvited(room);
			else if (membership === 'join') joined[room.roomId] = snapshotRoom(room);
		}
		return { joined, invited, left: [] };
	}

	public getPaginationToken(roomId: string): string | undefined {
		const room = this.client?.getRoom(roomId);
		return room?.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS) ?? undefined;
	}

	public async loadOlder(roomId: string): Promise<{ end: string | null; chunkLength: number }> {
		const client = this.requireClient();
		const room = client.getRoom(roomId);
		if (room == null) return { end: null, chunkLength: 0 };
		const before = room.getLiveTimeline().getEvents().length;
		await client.scrollback(room, 50);
		const after = room.getLiveTimeline().getEvents().length;
		const token = room.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS);
		this.callbacks.onSync(this.collectSnapshot());
		return { end: token, chunkLength: Math.max(0, after - before) };
	}

	public async sendText(roomId: string, body: string, replyToEventId?: string): Promise<void> {
		const client = this.requireClient();
		if (replyToEventId == null) {
			await client.sendMessage(roomId, { msgtype: MsgType.Text, body });
			return;
		}

		// The quoted fallback is what clients without reply support show, so it goes in `body`
		// itself rather than only in the relation.
		const quoted = client.getRoom(roomId)?.findEventById(replyToEventId);
		const quotedBody = quoted?.getContent().body;
		const fallback = typeof quotedBody === 'string'
			? `${quotedBody.split('\n').map(line => `> ${line}`).join('\n')}\n\n${body}`
			: body;

		await client.sendMessage(roomId, {
			msgtype: MsgType.Text,
			body: fallback,
			'm.relates_to': { 'm.in_reply_to': { event_id: replyToEventId } },
		} as never);
	}

	public async sendFile(roomId: string, file: File): Promise<void> {
		const client = this.requireClient();
		const encrypted = this.cryptoEnabled && await client.getCrypto()?.isEncryptionEnabledInRoom(roomId);
		const msgtype = file.type.startsWith('image/') ? MsgType.Image
			: file.type.startsWith('video/') ? MsgType.Video
				: file.type.startsWith('audio/') ? MsgType.Audio
					: MsgType.File;
		const info = { mimetype: file.type || 'application/octet-stream', size: file.size };

		if (encrypted) {
			const packed = await encryptAttachment(await file.arrayBuffer());
			const uploaded = await client.uploadContent(new Blob([packed.ciphertext], { type: 'application/octet-stream' }), { includeFilename: false });
			packed.file.url = uploaded.content_uri;
			await client.sendMessage(roomId, { msgtype, body: file.name, file: packed.file, info } as never);
			return;
		}

		const uploaded = await client.uploadContent(file);
		await client.sendMessage(roomId, { msgtype, body: file.name, url: uploaded.content_uri, info } as never);
	}

	public async editText(roomId: string, eventId: string, body: string): Promise<void> {
		await this.requireClient().sendMessage(roomId, {
			msgtype: MsgType.Text,
			body: `* ${body}`,
			'm.new_content': { msgtype: MsgType.Text, body },
			'm.relates_to': { rel_type: 'm.replace', event_id: eventId },
		} as never);
	}

	public async redact(roomId: string, eventId: string): Promise<void> {
		await this.requireClient().redactEvent(roomId, eventId);
	}

	public async sendReaction(roomId: string, eventId: string, key: string): Promise<void> {
		await this.requireClient().sendEvent(roomId, 'm.reaction' as never, {
			'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key },
		} as never);
	}

	public async join(roomIdOrAlias: string): Promise<string> {
		const room = await this.requireClient().joinRoom(roomIdOrAlias.trim());
		return room.roomId;
	}

	public async leave(roomId: string): Promise<void> {
		await this.requireClient().leave(roomId);
	}

	public async createDirectRoom(userId: string): Promise<string> {
		const client = this.requireClient();
		const initial_state = this.cryptoEnabled
			? [{ type: EventType.RoomEncryption, content: { algorithm: 'm.megolm.v1.aes-sha2' } }]
			: [];
		const result = await client.createRoom({
			is_direct: true,
			invite: [userId.trim()],
			preset: 'trusted_private_chat' as never,
			initial_state,
		});
		return result.room_id;
	}

	public async setTyping(roomId: string, typing: boolean): Promise<void> {
		await this.requireClient().sendTyping(roomId, typing, typing ? 20000 : 0);
	}

	public async markAsRead(roomId: string, eventId: string): Promise<void> {
		const client = this.requireClient();
		const room = client.getRoom(roomId);
		const event = room?.findEventById(eventId);
		if (event != null) await client.sendReadReceipt(event);
		await client.setRoomReadMarkers(roomId, eventId, event ?? undefined);
	}

	public async downloadMedia(mxcUrl: string, thumbnail?: { width: number; height: number }, encryptedFile?: EncryptedAttachmentFile): Promise<Blob> {
		const client = this.requireClient();
		const httpUrl = thumbnail == null
			? client.mxcUrlToHttp(mxcUrl, undefined, undefined, undefined, false, true, true)
			: client.mxcUrlToHttp(mxcUrl, thumbnail.width, thumbnail.height, 'scale', false, true, true);
		if (httpUrl == null) throw new TypeError(`Not an mxc URL: ${mxcUrl}`);
		const response = await window.fetch(httpUrl, {
			headers: { Authorization: `Bearer ${this.session.accessToken}` },
		});
		if (!response.ok) {
			throw new MatrixApiError(response.status, response.statusText);
		}
		const buffer = await response.arrayBuffer();
		if (encryptedFile != null) {
			const plain = await decryptAttachment(buffer, encryptedFile);
			return new Blob([plain]);
		}
		return new Blob([buffer]);
	}

	public async unverifiedDeviceCount(): Promise<number> {
		const crypto = this.client?.getCrypto();
		if (crypto == null || this.session.userId == null) return 0;
		const devices = await crypto.getUserDeviceInfo([this.session.userId]);
		const mine = devices.get(this.session.userId);
		if (mine == null) return 0;
		let count = 0;
		for (const device of mine.values()) {
			if (device.deviceId === this.session.deviceId) continue;
			const status = await crypto.getDeviceVerificationStatus(this.session.userId, device.deviceId);
			if (status == null || !status.isVerified()) count++;
		}
		return count;
	}

	public async isSecretStorageReady(): Promise<boolean> {
		return await this.client?.getCrypto()?.isSecretStorageReady() ?? false;
	}

	/**
	 * Answers the homeserver when it asks the user to prove who they are again.
	 *
	 * Publishing cross-signing keys is guarded by user-interactive auth: `/keys/device_signing/upload`
	 * answers 401 with a list of flows unless the request carries one. Synapse lets the very first
	 * upload through on a freshly authenticated session, which is why this only shows up the second
	 * time someone sets a backup up — and without a handler it surfaced as a raw 401.
	 */
	private authUploadDeviceSigningKeys(accountPassword?: string) {
		return async (makeRequest: (auth: Record<string, unknown> | null) => Promise<unknown>): Promise<void> => {
			try {
				await makeRequest(null);
				return;
			} catch (error) {
				if (accountPassword == null || !isUiaRequired(error)) throw error;
			}
			await makeRequest({
				type: 'm.login.password',
				identifier: { type: 'm.id.user', user: this.session.userId },
				password: accountPassword,
			});
		};
	}

	public async setupKeyBackup(accountPassword?: string): Promise<string> {
		const crypto = this.requireCrypto();
		const generated = await crypto.createRecoveryKeyFromPassphrase();
		const encoded = generated.encodedPrivateKey;
		if (encoded == null) throw new Error('The SDK did not return a recovery key.');
		this.pendingRecoveryKey = generated.privateKey;
		await crypto.bootstrapCrossSigning({
			setupNewCrossSigning: true,
			authUploadDeviceSigningKeys: this.authUploadDeviceSigningKeys(accountPassword) as never,
		});
		await crypto.bootstrapSecretStorage({
			createSecretStorageKey: async () => generated,
			setupNewKeyBackup: true,
			setupNewSecretStorage: true,
		});
		this.pendingRecoveryKey = null;
		return encoded;
	}

	public async restoreKeyBackup(recoveryKey: string, accountPassword?: string): Promise<void> {
		const crypto = this.requireCrypto();
		this.pendingRecoveryKey = decodeRecoveryKey(recoveryKey);
		await crypto.bootstrapCrossSigning({
			setupNewCrossSigning: false,
			authUploadDeviceSigningKeys: this.authUploadDeviceSigningKeys(accountPassword) as never,
		});
		await crypto.bootstrapSecretStorage({ setupNewKeyBackup: false });
		await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
		this.pendingRecoveryKey = null;
	}

	public async startOwnVerification(): Promise<SasChallenge | null> {
		const crypto = this.requireCrypto();
		const request = await crypto.requestOwnUserVerification();
		this.verificationRequest = request;
		if (request.phase === 1 /* Requested */ && !request.initiatedByMe) {
			await request.accept();
		}
		return await this.waitForSas(request);
	}

	private async waitForSas(request: VerificationRequest): Promise<SasChallenge | null> {
		const started = request.verifier ?? await request.startVerification('m.sas.v1');
		return await new Promise((resolve, reject) => {
			const tryRead = () => {
				const sas = started.getShowSasCallbacks();
				if (sas?.sas.emoji != null) {
					resolve({
						emojis: sas.sas.emoji,
						confirm: () => sas.confirm(),
						mismatch: () => sas.mismatch(),
						cancel: () => sas.cancel(),
					});
					return true;
				}
				return false;
			};
			if (tryRead()) return;
			started.on(VerifierEvent.ShowSas, () => { tryRead(); });
			request.on(VerificationRequestEvent.Change, () => { tryRead(); });
			void started.verify().catch(reject);
		});
	}

	/**
	 * Stops the long poll without discarding the client.
	 *
	 * Leaving a chat view must not throw the session away: rebuilding it means another WASM crypto
	 * init and another initial sync, and two clients would briefly hold the same crypto database.
	 */
	public pause(): void {
		this.client?.stopClient();
	}

	public resume(): void {
		if (this.client == null || this.stopped) return;
		void this.client.startClient({ initialSyncLimit: 30, lazyLoadMembers: true });
	}

	/** Re-reads the rooms the client already holds, for callers that changed something locally. */
	public refresh(): void {
		if (!this.stopped && this.client != null) this.callbacks.onSync(this.collectSnapshot());
	}

	public async ownDevices(): Promise<DeviceSummary[]> {
		const crypto = this.client?.getCrypto();
		if (crypto == null) return [];
		const info = await crypto.getUserDeviceInfo([this.session.userId]);
		const mine = info.get(this.session.userId);
		if (mine == null) return [];

		const summaries: DeviceSummary[] = [];
		for (const device of mine.values()) {
			const status = await crypto.getDeviceVerificationStatus(this.session.userId, device.deviceId);
			summaries.push({
				deviceId: device.deviceId,
				displayName: device.displayName ?? null,
				// The Ed25519 fingerprint is what a person compares when verifying out of band.
				fingerprint: device.getFingerprint() ?? null,
				verified: status?.isVerified() ?? false,
				current: device.deviceId === this.session.deviceId,
			});
		}
		return summaries.sort((a, b) => Number(b.current) - Number(a.current));
	}

	public async logout(): Promise<void> {
		try {
			await this.client?.logout(true);
		} catch {
			// The token may already be dead.
		}
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		this.client?.stopClient();
		this.client?.removeAllListeners();
	}

	private requireClient(): MatrixClient {
		if (this.client == null) throw new Error('The Matrix SDK session has not started.');
		return this.client;
	}

	private requireCrypto(): CryptoApi {
		const crypto = this.client?.getCrypto();
		if (crypto == null) throw new Error('Encryption is not available in this browser.');
		return crypto;
	}
}

async function resolveDeviceId(session: MatrixSession): Promise<string | undefined> {
	try {
		const response = await globalThis.fetch(`${session.homeserverUrl}/_matrix/client/v3/account/whoami`, {
			headers: { Authorization: `Bearer ${session.accessToken}` },
		});
		if (!response.ok) return undefined;
		const body = await response.json() as { device_id?: unknown };
		return typeof body.device_id === 'string' && body.device_id.length > 0 ? body.device_id : undefined;
	} catch {
		return undefined;
	}
}

export async function startMatrixSdkSession(session: MatrixSession, callbacks: SdkSessionCallbacks): Promise<MatrixSdkSession> {
	const handle = new MatrixSdkSession(session, callbacks);
	await handle.start();
	return handle;
}

/** A 401 carrying UIA flows, rather than a rejected access token. */
function isUiaRequired(error: unknown): boolean {
	const status = (error as { httpStatus?: number } | null)?.httpStatus;
	const data = (error as { data?: { flows?: unknown; session?: unknown } } | null)?.data;
	return status === 401 && (data?.flows != null || data?.session != null);
}

function isAuthError(error: unknown): boolean {
	if (error instanceof MatrixApiError) return error.isAuthenticationFailure;
	const status = (error as { httpStatus?: number; status?: number } | null)?.httpStatus
		?? (error as { status?: number } | null)?.status;
	const errcode = (error as { errcode?: string } | null)?.errcode;
	return status === 401 || errcode === 'M_UNKNOWN_TOKEN' || errcode === 'M_MISSING_TOKEN';
}

export function encryptedFileFromContent(content: Record<string, unknown>): EncryptedAttachmentFile | undefined {
	return isEncryptedAttachmentFile(content.file) ? content.file : undefined;
}

export { parseMxcUrl };
