/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { describe, expect, test } from 'vitest';
import { verifyPassword } from '@/misc/password.js';

describe('verifyPassword', () => {
	test('bcrypt hashを検証できる', async () => {
		// Given
		const password = 'correct horse battery staple';
		const hash = await bcrypt.hash(password, 8);

		// When
		const result = await verifyPassword(password, hash);

		// Then
		expect(result).toBe(true);
	});

	test('CherryPickから引き継いだArgon2id hashを検証できる', async () => {
		// Given
		const password = 'correct horse battery staple';
		const hash = await argon2.hash(password, { type: argon2.argon2id });

		// When
		const result = await verifyPassword(password, hash);

		// Then
		expect(result).toBe(true);
	});

	test('誤ったパスワードを拒否する', async () => {
		// Given
		const hash = await argon2.hash('correct password', { type: argon2.argon2id });

		// When
		const result = await verifyPassword('wrong password', hash);

		// Then
		expect(result).toBe(false);
	});

	test('壊れたArgon2id hashを拒否する', async () => {
		// Given / When
		const result = await verifyPassword('password', '$argon2id$invalid');

		// Then
		expect(result).toBe(false);
	});
});
