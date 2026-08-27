/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { decryptAttachment, encryptAttachment } from '@/pages/chat/matrix-attachment-crypto.js';

describe('encrypted Matrix attachments', () => {
	test('round-trips bytes through AES-CTR', async () => {
		const payload = new TextEncoder().encode('secret file bytes');
		const { ciphertext, file } = await encryptAttachment(payload.buffer);
		const plain = await decryptAttachment(ciphertext, file);
		expect(new TextDecoder().decode(plain)).toBe('secret file bytes');
	});
});
