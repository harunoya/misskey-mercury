<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="$i.policies.chatAvailability === 'available'" primary gradate rounded :class="$style.start" @click="start"><i class="ti ti-plus"></i> {{ i18n.ts.startChat }}</MkButton>

	<MkInfo v-else>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>

	<!-- Matrix has no screen of its own any more: its conversations are in the history below, and
	     everything that used to live in a separate tab is reachable from here. -->
	<MkInfo v-if="matrix.sessionExpired.value" warn>{{ i18n.ts._matrix.sessionExpired }}</MkInfo>
	<MkInfo v-else-if="matrix.connectionError.value" warn>{{ matrix.connectionError.value }}</MkInfo>

	<div v-if="matrixInvites.length > 0" class="_gaps_s">
		<div v-for="invite in matrixInvites" :key="invite.roomId" class="_panel" :class="$style.invite">
			<MatrixAvatar :name="invite.name" :size="38"/>
			<div :class="$style.inviteBody">
				<span :class="$style.inviteName">{{ invite.name }}<span :class="$style.networkBadge">Matrix</span></span>
				<span :class="$style.inviteFrom">{{ i18n.tsx._matrix.invitedBy({ user: invite.inviter }) }}</span>
			</div>
			<div :class="$style.inviteActions">
				<MkButton primary small :disabled="respondingInviteIds.includes(invite.roomId)" @click="respondToInvite(invite.roomId, true)">{{ i18n.ts._matrix.acceptInvite }}</MkButton>
				<MkButton small :disabled="respondingInviteIds.includes(invite.roomId)" @click="respondToInvite(invite.roomId, false)">{{ i18n.ts._matrix.declineInvite }}</MkButton>
			</div>
		</div>
	</div>

	<MkAd :preferForms="['horizontal', 'horizontal-big']"/>

	<MkInfo v-if="searchQuery.length > 0">{{ i18n.ts._matrix.searchSkipsEncrypted }}</MkInfo>
	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessages"
		type="search"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton v-if="searchQuery.length > 0" primary rounded @click="search">{{ i18n.ts.search }}</MkButton>

	<MkFoldableSection v-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<div class="_gaps_s">
			<div v-for="message in searchResults" :key="message.id" :class="$style.searchResultItem">
				<XMessage :message="message" :isSearchResult="true"/>
			</div>
		</div>
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>{{ i18n.ts._chat.history }}</template>

		<MkChatHistories/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MatrixAvatar from './matrix-avatar.vue';
import * as matrix from './matrix-store.js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';
import type { MenuItem } from '@/types/menu.js';
import type { MatrixSession } from './matrix-client.js';
import { matrixSessionKey } from './matrix-client.js';

const $i = ensureSignin();

const router = useRouter();

const searchQuery = ref('');
const searched = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const respondingInviteIds = ref<string[]>([]);

const matrixInvites = computed(() => matrix.invites.value);

// The invitations and the connection state shown here need the sync, and the history list below is
// inside a foldable section that may be closed.
// Balanced against the mount, not setup: see the same pairing in matrix-room.vue.
onMounted(() => matrix.acquireSync());
onUnmounted(() => matrix.releaseSync());

// Joining a room, or accepting an invitation, only produces a room once the next sync arrives.
watch(matrix.rooms, () => {
	const roomId = matrix.takePendingRoomId();
	if (roomId != null) openMatrixRoom(roomId);
}, { deep: true });

function openMatrixRoom(roomId: string) {
	router.push('/chat/matrix/:matrixRoomId', { params: { matrixRoomId: roomId } });
}

function start(ev: PointerEvent) {
	const items: MenuItem[] = [{
		text: i18n.ts._chat.individualChat,
		caption: i18n.ts._chat.individualChat_description,
		icon: 'ti ti-user',
		action: () => { startUser(); },
	}, { type: 'divider' }, {
		type: 'parent',
		text: i18n.ts._chat.roomChat,
		caption: i18n.ts._chat.roomChat_description,
		icon: 'ti ti-users-group',
		children: [{
			text: i18n.ts._chat.createRoom,
			icon: 'ti ti-plus',
			action: () => { createRoom(); },
		}],
	}, { type: 'divider' }, {
		type: 'label',
		text: i18n.ts._matrix.title,
	}];

	if (matrix.session.value == null) {
		items.push({
			text: i18n.ts._matrix.connect,
			caption: i18n.ts._matrix.connectDescription,
			icon: 'ti ti-plug',
			action: () => { openMatrixLogin(); },
		});
	} else {
		items.push({
			text: i18n.ts._matrix.newDirectMessage,
			caption: i18n.ts._matrix.newDirectMessageDescription,
			icon: 'ti ti-user',
			action: () => { startMatrixDirect(); },
		}, {
			text: i18n.ts._matrix.joinRoom,
			caption: i18n.ts._matrix.joinRoomDescription,
			icon: 'ti ti-door-enter',
			action: () => { joinMatrixRoom(); },
		}, {
			type: 'parent',
			text: matrix.session.value.userId,
			icon: 'ti ti-user-circle',
			children: matrixAccountMenu(),
		});
	}

	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

function matrixAccountMenu(): MenuItem[] {
	const activeKey = matrix.session.value == null ? null : matrixSessionKey(matrix.session.value);
	return [...matrix.sessions.value.map(saved => ({
		text: saved.userId,
		caption: saved.homeserverUrl,
		icon: 'ti ti-user-circle',
		active: matrixSessionKey(saved) === activeKey,
		action: () => {
			if (matrixSessionKey(saved) !== activeKey) switchMatrixSession(saved);
		},
	})), { type: 'divider' as const }, {
		text: i18n.ts._matrix.verifyDevices,
		icon: 'ti ti-shield-check',
		action: () => { openMatrixVerify(); },
	}, {
		text: i18n.ts._matrix.keyBackup,
		icon: 'ti ti-key',
		action: () => { openMatrixBackup(); },
	}, {
		text: i18n.ts._matrix.devices,
		icon: 'ti ti-devices',
		action: () => { openDeviceList(); },
	}, {
		text: i18n.ts.addAccount,
		icon: 'ti ti-user-plus',
		action: () => { openMatrixLogin(); },
	}, {
		text: i18n.ts._matrix.disconnect,
		icon: 'ti ti-logout',
		danger: true,
		action: () => { logoutMatrix(); },
	}];
}

function switchMatrixSession(session: MatrixSession) {
	matrix.activateSession(session);
}

function openMatrixLogin() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./matrix-login-dialog.vue')), {}, {
		closed: () => dispose(),
	});
}

function openMatrixVerify() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./matrix-verify-dialog.vue')), {}, {
		closed: () => dispose(),
	});
}

function openMatrixBackup() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./matrix-backup-dialog.vue')), {}, {
		closed: () => dispose(),
	});
}

function openDeviceList() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./matrix-devices-dialog.vue')), {}, {
		closed: () => dispose(),
	});
}

async function startMatrixDirect() {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._matrix.newDirectMessage,
		text: i18n.ts._matrix.directMessageUserId,
		placeholder: '@user:example.com',
		minLength: 3,
	});
	if (canceled || !result) return;
	try {
		const roomId = await matrix.createDirectRoom(result);
		if (roomId != null) openMatrixRoom(roomId);
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.createRoomError, error) });
	}
}

async function joinMatrixRoom() {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._matrix.joinRoom,
		text: i18n.ts._matrix.joinRoomPrompt,
		placeholder: '#room:example.com',
		minLength: 3,
	});
	if (canceled || !result) return;
	try {
		const roomId = await matrix.joinRoom(result);
		if (roomId != null) openMatrixRoom(roomId);
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.joinRoomError, error) });
	}
}

async function logoutMatrix() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.logout,
		text: i18n.ts._matrix.logoutConfirm,
	});
	if (canceled) return;
	await matrix.logout();
}

async function respondToInvite(roomId: string, accept: boolean) {
	if (respondingInviteIds.value.includes(roomId)) return;
	respondingInviteIds.value = [...respondingInviteIds.value, roomId];
	try {
		await matrix.respondToInvite(roomId, accept);
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.connectionError, error) });
	} finally {
		respondingInviteIds.value = respondingInviteIds.value.filter(id => id !== roomId);
	}
}

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push('/chat/user/:userId', {
			params: {
				userId: user.id,
			},
		});
	});
}

async function createRoom() {
	const { canceled, result } = await os.inputText({
		title: i18n.ts.name,
		minLength: 1,
	});
	if (canceled) return;

	const room = await misskeyApi('chat/rooms/create', {
		name: result,
	});

	router.push('/chat/room/:roomId', {
		params: {
			roomId: room.id,
		},
	});
}

async function search() {
	const res = await misskeyApi('chat/messages/search', {
		query: searchQuery.value,
	});

	searchResults.value = res;
	searched.value = true;
}

onMounted(() => {
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
});
</script>

<style lang="scss" module>
.start {
	margin: 0 auto;
}

.searchResultItem {
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
}

.invite {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
}

.inviteBody {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
}

.inviteName {
	display: flex;
	align-items: center;
	gap: 6px;
	font-weight: 700;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.networkBadge {
	flex-shrink: 0;
	padding: 1px 6px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.7em;
	font-weight: 700;
}

.inviteFrom {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.inviteActions {
	display: flex;
	gap: 6px;
	flex-shrink: 0;
}
</style>
