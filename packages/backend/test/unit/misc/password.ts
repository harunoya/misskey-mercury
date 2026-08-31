/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { describe, expect, test } from 'vitest';
import { BCRYPT_COST, getPasswordHashType, hashPassword, verifyPassword } from '@/misc/password.js';

describe('getPasswordHashType', () => {
	test('bcrypt hashを現行方式として分類する', async () => {
		const hash = await bcrypt.hash('password', 8);

		expect(getPasswordHashType(hash)).toBe('bcrypt');
	});

	test('Argon2 hashを旧方式として分類する', async () => {
		const hash = await argon2.hash('password', { type: argon2.argon2id });

		expect(getPasswordHashType(hash)).toBe('legacy');
	});

	test('パスワード未設定を分類する', () => {
		expect(getPasswordHashType(null)).toBe('none');
	});

	test('未知のhashを分類する', () => {
		expect(getPasswordHashType('unknown-hash')).toBe('unknown');
	});
});

describe('hashPassword', () => {
	test('uses bcrypt cost 10', async () => {
		const hash = await hashPassword('password');
		expect(hash.startsWith(`$2a$${String(BCRYPT_COST).padStart(2, '0')}$`) || hash.startsWith(`$2b$${String(BCRYPT_COST).padStart(2, '0')}$`)).toBe(true);
		expect(await verifyPassword('password', hash)).toBe(true);
	});
});

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
