/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Matrix encrypted attachments (AES-CTR v2). Room keys stay in the SDK; this only
 * wraps the file bytes as the spec requires.
 *
 * @see https://spec.matrix.org/v1.11/client-server-api/#extensions-to-mroommessage-msgtypes
 */

export type EncryptedAttachmentFile = {
	url: string;
	key: {
		alg: string;
		key_ops: string[];
		kty: string;
		k: string;
		ext: boolean;
	};
	iv: string;
	hashes: { [alg: string]: string };
	v: string;
};

function unpaddedBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=+$/g, '');
}

function fromUnpaddedBase64(value: string): Uint8Array {
	const padded = value + '==='.slice((value.length + 3) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export async function encryptAttachment(data: ArrayBuffer): Promise<{ ciphertext: ArrayBuffer; file: EncryptedAttachmentFile }> {
	const key = await crypto.subtle.generateKey({ name: 'AES-CTR', length: 256 }, true, ['encrypt', 'decrypt']);
	const iv = new Uint8Array(16);
	crypto.getRandomValues(iv.subarray(0, 8));
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, data);
	const jwk = await crypto.subtle.exportKey('jwk', key);
	const digest = await crypto.subtle.digest('SHA-256', ciphertext);
	if (typeof jwk.k !== 'string') throw new Error('Failed to export attachment key.');

	return {
		ciphertext,
		file: {
			url: '',
			key: {
				alg: 'A256CTR',
				ext: true,
				k: jwk.k,
				key_ops: ['encrypt', 'decrypt'],
				kty: 'oct',
			},
			iv: unpaddedBase64(iv),
			hashes: { sha256: unpaddedBase64(new Uint8Array(digest)) },
			v: 'v2',
		},
	};
}

export async function decryptAttachment(ciphertext: ArrayBuffer, file: EncryptedAttachmentFile): Promise<ArrayBuffer> {
	const iv = Uint8Array.from(fromUnpaddedBase64(file.iv));
	const key = await crypto.subtle.importKey(
		'jwk',
		{
			alg: file.key.alg,
			ext: file.key.ext,
			k: file.key.k,
			key_ops: file.key.key_ops,
			kty: file.key.kty,
		},
		{ name: 'AES-CTR' },
		false,
		['decrypt'],
	);
	return await crypto.subtle.decrypt({ name: 'AES-CTR', counter: iv as BufferSource, length: 64 }, key, ciphertext);
}

export function isEncryptedAttachmentFile(value: unknown): value is EncryptedAttachmentFile {
	if (value == null || typeof value !== 'object') return false;
	const file = value as Partial<EncryptedAttachmentFile>;
	return typeof file.url === 'string' && file.key != null && typeof file.key === 'object' && typeof file.iv === 'string';
}
