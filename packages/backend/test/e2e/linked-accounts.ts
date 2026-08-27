/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, test } from 'vitest';
import { api, failedApiCall, signup, successfulApiCall, type UserToken } from '../utils.js';

/** サブアカウントは自身のパスウォードを持たないので、メインの現在のパスワードでサインインしてトークンを得る */
async function signinAs(username: string, password: string): Promise<UserToken> {
	const res = await api('signin-flow', { username, password });
	assert.strictEqual(res.status, 200, JSON.stringify(res.body));
	assert.ok(res.body != null && 'i' in res.body);
	return { token: (res.body as { i: string }).i };
}

describe('関連アカウント', () => {
	test('新規サブアカウントを作成すると、サブアカウントはメインアカウントのパスワードでログインできる', async () => {
		const main = await signup({ username: 'linkmain1', password: 'main-password' });

		const sub = await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linksub1' },
			user: main,
		});

		const list = await successfulApiCall({
			endpoint: 'i/linked-accounts/list',
			parameters: {},
			user: main,
		});
		assert.ok(list.subAccounts.some(u => u.id === sub.id));

		const signinRes = await api('signin-flow', { username: 'linksub1', password: 'main-password' });
		assert.strictEqual(signinRes.status, 200);
	});

	test('サブアカウントは独自のパスワードではログインできない', async () => {
		const main = await signup({ username: 'linkmain2', password: 'main-password' });
		await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linksub2' },
			user: main,
		});

		const signinRes = await api('signin-flow', { username: 'linksub2', password: 'some-other-password' });
		assert.strictEqual(signinRes.status, 403);
	});

	test('既存アカウントは正しいパスワードでのみ関連付けられる', async () => {
		const main = await signup({ username: 'linkmain3', password: 'main-password' });
		await signup({ username: 'linktarget3', password: 'target-password' });

		await failedApiCall({
			endpoint: 'i/linked-accounts/link',
			parameters: { username: 'linktarget3', password: 'wrong-password' },
			user: main,
		}, {
			status: 400,
			code: 'INCORRECT_PASSWORD',
			id: '8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f',
		});

		const linked = await successfulApiCall({
			endpoint: 'i/linked-accounts/link',
			parameters: { username: 'linktarget3', password: 'target-password' },
			user: main,
		});
		assert.strictEqual(linked.username, 'linktarget3');

		// 関連付け後は独自パスワードでログインできない
		const oldPasswordSignin = await api('signin-flow', { username: 'linktarget3', password: 'target-password' });
		assert.strictEqual(oldPasswordSignin.status, 403);

		// メインアカウントのパスワードでログインできる
		const mainPasswordSignin = await api('signin-flow', { username: 'linktarget3', password: 'main-password' });
		assert.strictEqual(mainPasswordSignin.status, 200);
	});

	test('サブアカウントを持つアカウントを、他のアカウントのサブアカウントにはできない (連鎖の防止)', async () => {
		const main = await signup({ username: 'linkmain4', password: 'main-password' });
		await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linksub4' },
			user: main,
		});

		const other = await signup({ username: 'linkother4', password: 'other-password' });

		await failedApiCall({
			endpoint: 'i/linked-accounts/link',
			parameters: { username: 'linkmain4', password: 'main-password' },
			user: other,
		}, {
			status: 400,
			code: 'TARGET_HAS_SUB_ACCOUNTS',
			id: '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c',
		});
	});

	test('サブアカウントは自分自身をメインアカウントにできない (連鎖の防止)', async () => {
		const main = await signup({ username: 'linkmain5', password: 'main-password' });
		await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linksub5' },
			user: main,
		});
		const sub = await signinAs('linksub5', 'main-password');

		const other = await signup({ username: 'linkother5', password: 'other-password' });

		await failedApiCall({
			endpoint: 'i/linked-accounts/link',
			parameters: { username: 'linkother5', password: 'other-password' },
			user: sub,
		}, {
			status: 400,
			code: 'ALREADY_LINKED',
			id: '9c3b9b2a-3b1a-4b7a-9c9a-4d6b9f1a2c3d',
		});
	});

	test('サブアカウント自身が関連付けを解除でき、その後は新しいパスワードでログインできる', async () => {
		const main = await signup({ username: 'linkmain6', password: 'main-password' });
		await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linksub6' },
			user: main,
		});
		const sub = await signinAs('linksub6', 'main-password');

		await successfulApiCall({
			endpoint: 'i/linked-accounts/unlink',
			parameters: { newPassword: 'sub-own-password' },
			user: sub,
		});

		const mainPasswordSignin = await api('signin-flow', { username: 'linksub6', password: 'main-password' });
		assert.strictEqual(mainPasswordSignin.status, 403);

		const ownPasswordSignin = await api('signin-flow', { username: 'linksub6', password: 'sub-own-password' });
		assert.strictEqual(ownPasswordSignin.status, 200);
	});

	test('メインアカウントが他人のサブアカウントを勝手に解除できない', async () => {
		const main = await signup({ username: 'linkmain7', password: 'main-password' });
		await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linksub7' },
			user: main,
		});

		const other = await signup({ username: 'linkother7', password: 'other-password' });
		const otherSub = await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linkothersub7' },
			user: other,
		});

		await failedApiCall({
			endpoint: 'i/linked-accounts/unlink',
			parameters: { userId: otherSub.id, newPassword: 'stolen-password' },
			user: main,
		}, {
			status: 400,
			code: 'NOT_YOUR_SUB_ACCOUNT',
			id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
		});
	});

	test('サブアカウントはi/change-passwordを使えない', async () => {
		const main = await signup({ username: 'linkmain8', password: 'main-password' });
		await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linksub8' },
			user: main,
		});
		const sub = await signinAs('linksub8', 'main-password');

		await failedApiCall({
			endpoint: 'i/change-password',
			parameters: { currentPassword: 'main-password', newPassword: 'anything' },
			user: sub,
		}, {
			status: 400,
			code: 'LINKED_ACCOUNT',
			id: 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a',
		});
	});

	test('サブアカウントが残っている間はメインアカウントを削除できない', async () => {
		const main = await signup({ username: 'linkmain9', password: 'main-password' });
		await successfulApiCall({
			endpoint: 'i/linked-accounts/create-sub',
			parameters: { username: 'linksub9' },
			user: main,
		});

		await failedApiCall({
			endpoint: 'i/delete-account',
			parameters: { password: 'main-password' },
			user: main,
		}, {
			status: 400,
			code: 'HAS_LINKED_SUB_ACCOUNTS',
			id: 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b',
		});
	});
});
