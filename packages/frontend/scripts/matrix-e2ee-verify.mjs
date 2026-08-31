/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Two-client E2EE check against a real homeserver.
 *
 * Usage:
 *   SYNAPSE_URL=http://127.0.0.1:8008 node packages/frontend/scripts/matrix-e2ee-verify.mjs
 *
 * Registers alice/bob (or logs in if they already exist), creates an encrypted room, sends a
 * megolm text event and an encrypted attachment, and asserts the other device decrypts both.
 */

import { createClient, EventType, MsgType, ClientEvent, SyncState } from 'matrix-js-sdk';
import { encryptAttachment, decryptAttachment } from '../src/pages/chat/matrix-attachment-crypto.ts';

const homeserver = (process.env.SYNAPSE_URL ?? 'http://127.0.0.1:8008').replace(/\/$/, '');

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

async function login(username, password) {
	const res = await fetch(`${homeserver}/_matrix/client/v3/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			type: 'm.login.password',
			identifier: { type: 'm.id.user', user: username },
			password,
			initial_device_display_name: 'Mercury E2EE verify',
		}),
	});
	if (!res.ok) throw new Error(`login ${username}: ${res.status} ${await res.text()}`);
	return await res.json();
}

async function register(username, password) {
	const first = await fetch(`${homeserver}/_matrix/client/v3/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password, auth: { type: 'm.login.dummy' } }),
	});
	const body = await first.json().catch(() => ({}));
	if (first.ok) return body;
	if (body.errcode === 'M_USER_IN_USE') return await login(username, password);
	if (first.status === 401 && body.session) {
		const second = await fetch(`${homeserver}/_matrix/client/v3/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password, auth: { type: 'm.login.dummy', session: body.session } }),
		});
		const retry = await second.json().catch(() => ({}));
		if (second.ok) return retry;
		if (retry.errcode === 'M_USER_IN_USE') return await login(username, password);
		throw new Error(`register ${username}: ${second.status} ${JSON.stringify(retry)}`);
	}
	throw new Error(`register ${username}: ${first.status} ${JSON.stringify(body)}`);
}

async function startClient(creds, label) {
	const client = createClient({
		baseUrl: homeserver,
		accessToken: creds.access_token,
		userId: creds.user_id,
		deviceId: creds.device_id,
		fetchFn: (input, init) => fetch(input, init),
	});
	await client.initRustCrypto({ useIndexedDB: false });
	if (client.getCrypto() == null) throw new Error(`${label}: rust crypto did not start`);

	await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error(`${label}: sync timed out`)), 30000);
		client.once(ClientEvent.Sync, (state) => {
			if (state === SyncState.Prepared) {
				clearTimeout(timeout);
				resolve();
			}
		});
		client.startClient({ initialSyncLimit: 20 }).catch(reject);
	});
	return client;
}

async function waitForDecrypted(client, roomId, predicate, label) {
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline) {
		const room = client.getRoom(roomId);
		const events = room?.getLiveTimeline().getEvents() ?? [];
		for (const event of events) {
			if (event.isEncrypted() && event.getClearContent() == null) continue;
			if (predicate(event)) return event;
		}
		await new Promise(r => setTimeout(r, 250));
	}
	throw new Error(`${label}: decrypted event did not arrive`);
}

async function main() {
	const health = await fetch(`${homeserver}/health`).catch(() => null);
	if (health == null || !health.ok) {
		fail(`homeserver not reachable at ${homeserver}. Start Synapse first.`);
		return;
	}

	const aliceCreds = await register('alice', 'alice-pass-123');
	const bobCreds = await register('bob', 'bob-pass-123');
	const alice = await startClient(aliceCreds, 'alice');
	const bob = await startClient(bobCreds, 'bob');

	try {
		const created = await alice.createRoom({
			invite: [bobCreds.user_id],
			preset: 'trusted_private_chat',
			is_direct: true,
			initial_state: [{ type: EventType.RoomEncryption, content: { algorithm: 'm.megolm.v1.aes-sha2' } }],
		});
		const roomId = created.room_id;
		await bob.joinRoom(roomId);

		const encrypted = await alice.getCrypto()?.isEncryptionEnabledInRoom(roomId);
		if (!encrypted) fail('created room is not encrypted');
		else console.log('PASS: room has m.room.encryption');

		await alice.sendMessage(roomId, { msgtype: MsgType.Text, body: 'hello-e2ee' });
		const text = await waitForDecrypted(bob, roomId, (event) => event.getContent()?.body === 'hello-e2ee', 'bob text');
		if (text.getType() !== 'm.room.message') fail(`bob saw type ${text.getType()}`);
		else console.log('PASS: bob decrypted alice text');

		const packed = await encryptAttachment(new TextEncoder().encode('secret-file').buffer);
		const uploaded = await alice.uploadContent(new Blob([packed.ciphertext], { type: 'application/octet-stream' }), { includeFilename: false });
		packed.file.url = uploaded.content_uri;
		await alice.sendMessage(roomId, { msgtype: MsgType.File, body: 'secret.bin', file: packed.file, info: { mimetype: 'application/octet-stream', size: 11 } });

		const fileEvent = await waitForDecrypted(bob, roomId, (event) => event.getContent()?.msgtype === 'm.file', 'bob file');
		const file = fileEvent.getContent().file;
		if (file == null) fail('bob file event has no content.file');
		else {
			const media = await bob.downloadKeysForEvent?.(fileEvent).catch(() => null);
			void media;
			const httpUrl = bob.mxcUrlToHttp(file.url, undefined, undefined, undefined, false, true, true);
			const res = await fetch(httpUrl, { headers: { Authorization: `Bearer ${bobCreds.access_token}` } });
			const cipher = await res.arrayBuffer();
			const plain = await decryptAttachment(cipher, file);
			const decoded = new TextDecoder().decode(plain);
			if (decoded !== 'secret-file') fail(`attachment decrypted to ${JSON.stringify(decoded)}`);
			else console.log('PASS: bob decrypted alice encrypted attachment');
		}

		const raw = bob.getRoom(roomId)?.getLiveTimeline().getEvents()
			.find(event => event.getId() === text.getId());
		if (raw?.isDecryptionFailure?.()) fail('text event is a decryption failure');
		else console.log('PASS: no decryption failure on the known text event');
	} finally {
		alice.stopClient();
		bob.stopClient();
	}

	if (process.exitCode) {
		console.error('E2EE verification finished with failures.');
		process.exit(process.exitCode);
	}
	console.log('E2EE verification against', homeserver, 'passed.');
}

await main();
