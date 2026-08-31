<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="async () => { await fetchInitial() }">
	<template #header>
		<i class="ti ti-user-scan"></i>
		<span style="margin-left: 8px;">{{ column.name || (selected ? selected.username : i18n.ts._deck._columns.subAccountTl) }}</span>
	</template>

	<div v-if="selected == null" :class="$style.info">
		<p>{{ i18n.ts._subAccountTl.noAccount }}</p>
		<MkButton @click="openAccountPicker">{{ i18n.ts._subAccountTl.selectAccount }}</MkButton>
	</div>

	<div v-else-if="tokenRevoked" :class="$style.info">
		<p>{{ i18n.ts._subAccountTl.tokenRevoked }}</p>
	</div>

	<div v-else>
		<MkInfo :class="$style.readOnlyNotice">{{ i18n.ts._subAccountTl.readOnlyNotice }}</MkInfo>

		<MkLoading v-if="fetching"/>
		<MkResult v-else-if="notes.length === 0" type="empty" :text="i18n.ts.noNotes"/>
		<div v-else :class="$style.notes">
			<MkNote v-for="note in notes" :key="note.id" :note="note" :mock="true" :class="$style.note"/>
		</div>
	</div>
</XColumn>
</template>

<script lang="ts" setup>
import { computed, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { wsOrigin } from '@@/js/config.js';
import XColumn from './column.vue';
import type { Column } from '@/deck.js';
import type { MenuItem } from '@/types/menu.js';
import { updateColumn } from '@/deck.js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNote from '@/components/MkNote.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getAccounts, getAccountWithSigninDialog, switchAccount } from '@/accounts.js';
import { $i } from '@/i.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const AUTHENTICATION_FAILED_ERROR_ID = 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14';

type LocalAccount = Awaited<ReturnType<typeof getAccounts>>[number];

const props = defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const fetching = ref(true);
const tokenRevoked = ref(false);
const notes = shallowRef<Misskey.entities.Note[]>([]);
const selected = ref<LocalAccount | null>(null);

let stream: Misskey.Stream | null = null;
let connection: Misskey.IChannelConnection<Misskey.Channels['homeTimeline']> | null = null;

async function resolveSelected() {
	const accounts = await getAccounts();
	if (props.column.subAccountUserId == null) {
		selected.value = null;
		return;
	}
	selected.value = accounts.find(a => a.host === props.column.subAccountHost && a.id === props.column.subAccountUserId) ?? null;
}

function isAuthError(error: unknown): boolean {
	return typeof error === 'object' && error != null && 'id' in error && (error as { id: unknown }).id === AUTHENTICATION_FAILED_ERROR_ID;
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
			text: i18n.ts._subAccountTl.noOtherAccounts,
		});
		await addAccountAndSelect();
		return;
	}

	const menu: MenuItem[] = accounts.map(a => ({
		text: a.user?.name ? `${a.user.name} (@${a.username})` : `@${a.username}`,
		action: () => selectAccount(a),
	}));
	menu.push({ type: 'divider' }, {
		text: i18n.ts._subAccountTl.addAccount,
		icon: 'ti ti-plus',
		action: addAccountAndSelect,
	});

	os.popupMenu(menu);
}

async function selectAccount(account: LocalAccount) {
	selected.value = account;
	updateColumn(props.column.id, {
		subAccountHost: account.host,
		subAccountUserId: account.id,
	});
	await refresh();
}

const menu = computed<MenuItem[]>(() => {
	const items: MenuItem[] = [{
		text: i18n.ts._subAccountTl.selectAccount,
		icon: 'ti ti-user-scan',
		action: openAccountPicker,
	}];
	if (selected.value != null) {
		items.push({
			text: i18n.ts._subAccountTl.switchToThisAccount,
			icon: 'ti ti-switch-horizontal',
			action: () => switchAccount(selected.value!.host, selected.value!.id),
		});
	}
	return items;
});

watch(() => [props.column.subAccountHost, props.column.subAccountUserId], () => {
	refresh();
});

onMounted(() => {
	refresh();
});

onBeforeUnmount(() => {
	disconnectStream();
});
</script>

<style lang="scss" module>
.info {
	padding: 32px 16px;
	text-align: center;

	> p {
		margin: 0 0 12px 0;
		opacity: 0.7;
	}
}

.readOnlyNotice {
	margin: 8px;
}

.notes {
	display: flex;
	flex-direction: column;
}

.note {
	padding: 16px 0;
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}
</style>
