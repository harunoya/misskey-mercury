/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const misskeyApi = vi.fn();

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: (...args: unknown[]) => misskeyApi(...args) }));

const { Paginator } = await import('@/utility/paginator.js');

/** `misskeyApi` に渡された資格情報 (第3引数)。 */
function credentialOf(call: unknown[] | undefined) {
	return call?.[2];
}

describe('Paginator の資格情報', () => {
	beforeEach(() => {
		misskeyApi.mockReset();
		misskeyApi.mockResolvedValue([]);
	});

	test('tokenを指定しなければ undefined を渡し、サインイン中のアカウントとして呼ばせる', async () => {
		// misskeyApi は `token !== undefined` で上書きを判断する。省略時に undefined 以外を
		// 渡すと、サインイン中の資格情報を打ち消してしまう。
		const paginator = new Paginator('notes/timeline', {});

		await paginator.init();

		expect(credentialOf(misskeyApi.mock.calls[0])).toBeUndefined();
	});

	test('tokenを指定すればそのトークンで呼ぶ', async () => {
		const paginator = new Paginator('notes/timeline', { token: 'tok-linked' });

		await paginator.init();

		expect(credentialOf(misskeyApi.mock.calls[0])).toBe('tok-linked');
	});

	test('追加読み込みも同じトークンで呼ぶ', async () => {
		misskeyApi.mockResolvedValue([{ id: 'a', createdAt: new Date().toISOString() }]);
		const paginator = new Paginator('notes/timeline', { token: 'tok-linked' });

		await paginator.init();
		await paginator.fetchOlder();
		await paginator.fetchNewer();

		expect(misskeyApi.mock.calls.length).toBeGreaterThanOrEqual(3);
		for (const call of misskeyApi.mock.calls) {
			expect(credentialOf(call)).toBe('tok-linked');
		}
	});
});
