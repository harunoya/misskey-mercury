/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const misskeyApi = vi.fn();
const getAccounts = vi.fn();

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: (...args: unknown[]) => misskeyApi(...args) }));
vi.mock('@/accounts.js', () => ({
	getAccounts: () => getAccounts(),
	getAccountWithSigninDialog: vi.fn(),
	switchAccount: vi.fn(),
}));
vi.mock('@/i.js', () => ({ $i: { id: 'me' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _linkedTl: { noOtherAccounts: '', addAccount: '' } } } }));
vi.mock('@/os.js', () => ({ alert: vi.fn(), popupMenu: vi.fn() }));

const { useLinkedTimeline } = await import('@/composables/use-linked-timeline.js');

const AUTHENTICATION_FAILED = { id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14' };

/** 保存済みの選択を固定して composable を起こす。 */
function setup(saved: { host?: string | null; userId?: string | null }) {
	return useLinkedTimeline(() => saved, () => {});
}

function account(id: string, token: string | null) {
	return { id, host: null, username: id, token, user: null };
}

describe('useLinkedTimeline', () => {
	beforeEach(() => {
		misskeyApi.mockReset();
		getAccounts.mockReset();
		misskeyApi.mockResolvedValue({});
	});

	test('何も選ばれていなければ noAccount で、問い合わせもしない', async () => {
		getAccounts.mockResolvedValue([]);
		const tl = setup({ host: null, userId: null });

		await tl.refresh();

		expect(tl.state.value).toBe('noAccount');
		expect(tl.token.value).toBeUndefined();
		expect(misskeyApi).not.toHaveBeenCalled();
	});

	test('トークンが保存されていないアカウントは unavailable になり、問い合わせもしない', async () => {
		// 回帰: ここで token を undefined にせず素通しすると、共通タイムラインが
		// `i: null` を送って CREDENTIAL_REQUIRED になっていた。
		getAccounts.mockResolvedValue([account('sub', null)]);
		const tl = setup({ host: null, userId: 'sub' });

		await tl.refresh();

		expect(tl.state.value).toBe('unavailable');
		expect(tl.token.value).toBeUndefined();
		expect(misskeyApi).not.toHaveBeenCalled();
	});

	test('トークンが通れば ready になり、そのトークンを渡す', async () => {
		getAccounts.mockResolvedValue([account('sub', 'tok-sub')]);
		const tl = setup({ host: null, userId: 'sub' });

		await tl.refresh();

		expect(tl.state.value).toBe('ready');
		expect(tl.token.value).toBe('tok-sub');
		expect(misskeyApi).toHaveBeenCalledWith('i', {}, 'tok-sub');
	});

	test('失効したトークンは unavailable として区別する', async () => {
		getAccounts.mockResolvedValue([account('sub', 'tok-sub')]);
		misskeyApi.mockRejectedValue(AUTHENTICATION_FAILED);
		const tl = setup({ host: null, userId: 'sub' });

		await tl.refresh();

		expect(tl.state.value).toBe('unavailable');
		expect(tl.token.value).toBeUndefined();
	});

	test('通信エラーは失効として扱わず、タイムライン側のエラー表示に任せる', async () => {
		getAccounts.mockResolvedValue([account('sub', 'tok-sub')]);
		misskeyApi.mockRejectedValue(new Error('network'));
		const tl = setup({ host: null, userId: 'sub' });

		await tl.refresh();

		expect(tl.state.value).toBe('ready');
		expect(tl.token.value).toBe('tok-sub');
	});

	test('保存済みの選択が見つからなければ noAccount に戻す', async () => {
		getAccounts.mockResolvedValue([account('other', 'tok-other')]);
		const tl = setup({ host: null, userId: 'gone' });

		await tl.refresh();

		expect(tl.state.value).toBe('noAccount');
		expect(tl.token.value).toBeUndefined();
	});

	test('続けて refresh したとき、古い問い合わせの結果で新しい選択を上書きしない', async () => {
		const saved: { host: string | null; userId: string | null } = { host: null, userId: 'stale' };
		getAccounts.mockResolvedValue([account('stale', 'tok-stale'), account('fresh', 'tok-fresh')]);

		// 先行する refresh の `i` だけを遅らせ、後発の解決より後に失効エラーで終わらせる。
		let rejectStale: ((reason: unknown) => void) | null = null;
		misskeyApi.mockImplementation((_ep: string, _params: unknown, token: string) => {
			if (token === 'tok-stale') return new Promise((_res, rej) => { rejectStale = rej; });
			return Promise.resolve({});
		});

		const tl = setup(saved);
		const stale = tl.refresh();

		saved.userId = 'fresh';
		await tl.refresh();

		rejectStale?.(AUTHENTICATION_FAILED);
		await stale;

		expect(tl.state.value).toBe('ready');
		expect(tl.token.value).toBe('tok-fresh');
	});
});
