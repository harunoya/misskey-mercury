/*
 * SPDX-FileCopyrightText: misskey-mercury contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'node:assert';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { api, randomString, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('signup approval', () => {
	let root: misskey.entities.SignupResponse;

	beforeAll(async () => {
		root = await signup({ username: 'root' });
		const response = await api('admin/update-meta', {
			approvalRequiredForSignup: true,
		}, root);
		assert.strictEqual(response.status, 204);
	});

	afterAll(async () => {
		await api('admin/update-meta', {
			approvalRequiredForSignup: false,
		}, root);
	});

	test('requires a registration reason', async () => {
		const response = await api('signup', {
			username: randomString(),
			password: 'test',
		});

		assert.strictEqual(response.status, 400);
	});

	test('blocks sign-in until a moderator approves the request', async () => {
		const username = randomString();
		const reason = 'I would like to join this server.';
		const signupResponse = await api('signup', {
			username,
			password: 'test',
			reason,
		});
		assert.strictEqual(signupResponse.status, 200);
		assert.deepStrictEqual(signupResponse.body, { pendingApproval: true });

		const signinBeforeApproval = await api('signin-flow', {
			username,
			password: 'test',
		});
		assert.strictEqual(signinBeforeApproval.status, 403);

		const pendingUsers = await api('admin/show-users', {
			state: 'pending',
			origin: 'local',
			limit: 10,
		}, root);
		assert.strictEqual(pendingUsers.status, 200);
		const pendingUser = pendingUsers.body.find(user => user.username === username);
		assert.ok(pendingUser);

		const details = await api('admin/show-user', {
			userId: pendingUser.id,
		}, root);
		assert.strictEqual(details.status, 200);
		assert.strictEqual(details.body.approved, false);
		assert.strictEqual(details.body.signupReason, reason);

		const approval = await api('admin/approve-user', {
			userId: pendingUser.id,
		}, root);
		assert.strictEqual(approval.status, 204);

		const signinAfterApproval = await api('signin-flow', {
			username,
			password: 'test',
		});
		assert.strictEqual(signinAfterApproval.status, 200);
	});

	test('a moderator can decline a pending request', async () => {
		const username = randomString();
		const signupResponse = await api('signup', {
			username,
			password: 'test',
			reason: 'Test decline flow.',
		});
		assert.strictEqual(signupResponse.status, 200);
		assert.deepStrictEqual(signupResponse.body, { pendingApproval: true });

		const pendingUsers = await api('admin/show-users', {
			state: 'pending',
			origin: 'local',
			limit: 10,
		}, root);
		const pendingUser = pendingUsers.body.find(user => user.username === username);
		assert.ok(pendingUser);

		const decline = await api('admin/decline-user', {
			userId: pendingUser.id,
		}, root);
		assert.strictEqual(decline.status, 204);

		const pendingUsersAfterDecline = await api('admin/show-users', {
			state: 'pending',
			origin: 'local',
			limit: 10,
		}, root);
		assert.strictEqual(pendingUsersAfterDecline.body.some(user => user.id === pendingUser.id), false);
	});
});
