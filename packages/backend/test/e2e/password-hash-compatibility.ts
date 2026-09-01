/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DataSource } from 'typeorm';
import { MiUserProfile } from '@/models/UserProfile.js';
import { api, initTestDb, signup } from '../utils.js';

describe('password hash compatibility', () => {
	let db: DataSource;

	beforeAll(async () => {
		db = await initTestDb(true);
	});

	afterAll(async () => {
		await db.destroy();
	});

	test('新規アカウントのパスワードをbcryptで保存する', async () => {
		// Given / When
		const user = await signup({ username: 'bcryptuser', password: 'test-password' });

		// Then
		const profile = await db.getRepository(MiUserProfile).findOneByOrFail({ userId: user.id });
		expect(profile.password).toMatch(/^\$2[aby]\$/);
	});

	test('CherryPickから移行したArgon2idパスワードでサインインできる', async () => {
		// Given
		const password = 'test-password';
		const user = await signup({ username: 'argon2iduser', password });
		const hash = await argon2.hash(password, { type: argon2.argon2id });
		await db.getRepository(MiUserProfile).update({ userId: user.id }, { password: hash });

		// When
		const response = await api('signin-flow', {
			username: user.username,
			password,
		});

		// Then
		expect(response.status).toBe(200);
	});
});
