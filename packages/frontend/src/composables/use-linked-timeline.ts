/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getAccounts, getAccountWithSigninDialog, switchAccount } from '@/accounts.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import type { MenuItem } from '@/types/menu.js';

const AUTHENTICATION_FAILED_ERROR_ID = 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14';

type LocalAccount = Awaited<ReturnType<typeof getAccounts>>[number];

/**
 * リンクタイムラインが今どの状態にあるか。
 *
 * - `noAccount`: 読む相手がまだ選ばれていない
 * - `unavailable`: 選ばれてはいるが、そのアカウントとして読めるトークンが無い
 *   (保存されていない / 失効している)
 * - `ready`: 読める
 */
export type LinkedTimelineState = 'noAccount' | 'unavailable' | 'ready';

export function isAuthenticationFailed(error: unknown): boolean {
	return typeof error === 'object' && error != null && 'id' in error
		&& (error as { id: unknown }).id === AUTHENTICATION_FAILED_ERROR_ID;
}

/**
 * リンクタイムラインのうち、「どのアカウントとして読むか」だけを扱う。
 *
 * ノートの取得・ページング・Streaming・新着queue・スクロール保持は、GTLなど他のタイムラインと
 * 同じ `MkStreamingNotesTimeline`(`src="linked"`)が持つ。ここが持つのは、共通実装に渡す
 * トークンを決めるまでの部分だけ。
 */
export function useLinkedTimeline(
	getSaved: () => { host?: string | null; userId?: string | null },
	save: (host: string, userId: string) => void,
) {
	const selected = ref<LocalAccount | null>(null);
	const revoked = ref(false);

	/**
	 * 共通タイムラインへ渡すトークン。読めないときは `undefined`。
	 *
	 * `null` にしないのは、`misskeyApi` が `token !== undefined` で判定するため。`null` を
	 * 渡すと `i: null` が送られ、サインイン中の資格情報を打ち消して CREDENTIAL_REQUIRED になる。
	 */
	const token = computed<string | undefined>(() => {
		if (revoked.value) return undefined;
		return selected.value?.token ?? undefined;
	});

	const state = computed<LinkedTimelineState>(() => {
		if (selected.value == null) return 'noAccount';
		return token.value == null ? 'unavailable' : 'ready';
	});

	// 選び直しが続けて起きたとき、古い問い合わせの結果で新しい選択を上書きしないための世代番号。
	let generation = 0;

	/**
	 * 保存されている選択を解決し、そのトークンで読めるかどうかまで確かめる。
	 *
	 * 失効の判定をここでするのは、共通タイムラインが持つエラー表示が「読み込みに失敗した、再試行」
	 * までしか言えないため。失効したトークンは何度試しても通らないので、その一件だけ見分けて
	 * アカウントを選び直せる案内に振り分ける。
	 */
	async function refresh(): Promise<void> {
		const current = ++generation;

		const saved = getSaved();
		const accounts = await getAccounts();
		if (current !== generation) return;

		const account = saved.userId == null
			? null
			: accounts.find(a => a.host === saved.host && a.id === saved.userId) ?? null;

		selected.value = account;
		revoked.value = false;

		// トークンが保存されていないなら問い合わせるものが無い。すでに `unavailable` である。
		if (account?.token == null) return;

		try {
			await misskeyApi('i', {}, account.token);
		} catch (error) {
			if (current !== generation) return;
			// 説明できるのは失効だけ。通信エラーなどはタイムライン側のエラー表示に任せる。
			revoked.value = isAuthenticationFailed(error);
		}
	}

	async function selectAccount(account: LocalAccount) {
		save(account.host, account.id);
		await refresh();
	}

	async function addAccountAndSelect() {
		const res = await getAccountWithSigninDialog();
		if (res == null) return;
		const added = (await getAccounts()).find(a => a.id === res.id);
		if (added) await selectAccount(added);
	}

	async function openAccountPicker() {
		const accounts = (await getAccounts()).filter(a => a.token != null && a.id !== $i?.id);

		if (accounts.length === 0) {
			await os.alert({
				type: 'info',
				text: i18n.ts._linkedTl.noOtherAccounts,
			});
			await addAccountAndSelect();
			return;
		}

		const menu: MenuItem[] = accounts.map(a => ({
			text: a.user?.name ? `${a.user.name} (@${a.username})` : `@${a.username}`,
			action: () => selectAccount(a),
		}));
		menu.push({ type: 'divider' }, {
			text: i18n.ts._linkedTl.addAccount,
			icon: 'ti ti-plus',
			action: addAccountAndSelect,
		});

		os.popupMenu(menu);
	}

	function switchToThisAccount() {
		if (selected.value == null) return;
		switchAccount(selected.value.host, selected.value.id);
	}

	return {
		state,
		token,
		selected,
		refresh,
		openAccountPicker,
		switchToThisAccount,
	};
}
