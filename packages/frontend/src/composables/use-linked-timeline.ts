/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, shallowRef, markRaw, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
import { wsOrigin } from '@@/js/config.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getAccounts, getAccountWithSigninDialog, switchAccount } from '@/accounts.js';
import { $i } from '@/i.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import type { MenuItem } from '@/types/menu.js';

const AUTHENTICATION_FAILED_ERROR_ID = 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14';

type LocalAccount = Awaited<ReturnType<typeof getAccounts>>[number];

export function useLinkedTimeline(
	getSaved: () => { host?: string | null; userId?: string | null },
	save: (host: string, userId: string) => void,
) {
	const fetching = ref(true);
	const tokenRevoked = ref(false);
	const notes = shallowRef<Misskey.entities.Note[]>([]);
	const selected = ref<LocalAccount | null>(null);

	let stream: Misskey.Stream | null = null;
	let connection: Misskey.IChannelConnection<Misskey.Channels['homeTimeline']> | null = null;

	function isAuthError(error: unknown): boolean {
		return typeof error === 'object' && error != null && 'id' in error && (error as { id: unknown }).id === AUTHENTICATION_FAILED_ERROR_ID;
	}

	async function resolveSelected() {
		const accounts = await getAccounts();
		const saved = getSaved();
		if (saved.userId == null) {
			selected.value = null;
			return;
		}
		selected.value = accounts.find(a => a.host === saved.host && a.id === saved.userId) ?? null;
	}

	async function fetchInitial() {
		if (selected.value?.token == null) {
			notes.value = [];
			return;
		}
		fetching.value = true;
		tokenRevoked.value = false;
		try {
			notes.value = await misskeyApi('notes/timeline', { limit: 15 }, selected.value.token);
		} catch (error) {
			notes.value = [];
			if (isAuthError(error)) tokenRevoked.value = true;
		} finally {
			fetching.value = false;
		}
	}

	function prepend(note: Misskey.entities.Note) {
		notes.value = [note, ...notes.value].slice(0, 60);
	}

	function disconnectStream() {
		connection?.dispose();
		connection = null;
		stream?.close();
		stream = null;
	}

	function connectStream() {
		disconnectStream();
		if (selected.value?.token == null || tokenRevoked.value || !store.s.realtimeMode) return;
		stream = markRaw(new Misskey.Stream(wsOrigin, { token: selected.value.token }));
		connection = stream.useChannel('homeTimeline', {});
		connection.on('note', prepend);
	}

	async function refresh() {
		await resolveSelected();
		await fetchInitial();
		connectStream();
	}

	async function selectAccount(account: LocalAccount) {
		selected.value = account;
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

	onBeforeUnmount(() => {
		disconnectStream();
	});

	return {
		fetching,
		tokenRevoked,
		notes,
		selected,
		refresh,
		openAccountPicker,
		switchToThisAccount,
	};
}
