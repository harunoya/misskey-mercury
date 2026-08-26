<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<template v-if="session == null || showLogin">
		<div class="_panel" :class="$style.loginShell">
			<div :class="$style.loginBrand">
				<div :class="$style.loginBrandIcon"><i class="ti ti-messages"></i></div>
				<h2 :class="$style.heading">{{ session == null ? i18n.ts._matrix.title : i18n.ts.addAccount }}</h2>
				<p>{{ i18n.ts._matrix.directBrowserNotice }}</p>
			</div>
			<form class="_gaps_m" :class="$style.loginForm" @submit.prevent="login">
				<MkInput v-model="homeserverUrl" type="url" required autocomplete="url">
					<template #label>{{ i18n.ts._matrix.homeserver }}</template>
				</MkInput>
				<MkInput v-model="userId" required autocomplete="username">
					<template #label>{{ i18n.ts._matrix.matrixId }}</template>
				</MkInput>
				<MkInput v-model="password" type="password" required autocomplete="current-password">
					<template #label>{{ i18n.ts._matrix.password }}</template>
				</MkInput>
				<MkInfo warn>{{ i18n.ts._matrix.tokenStorageNotice }}</MkInfo>
				<MkInfo v-if="loginError" warn>{{ loginError }}</MkInfo>
				<div :class="$style.loginActions">
					<MkButton v-if="session != null" type="button" :disabled="loggingIn" @click="cancelAddAccount">
						{{ i18n.ts.cancel }}
					</MkButton>
					<MkButton type="submit" primary :full="session == null" :wait="loggingIn">
						{{ loggingIn ? i18n.ts._matrix.connecting : i18n.ts._matrix.connect }}
					</MkButton>
				</div>
			</form>
		</div>
	</template>
	<template v-else>
		<div class="_panel" :class="[$style.client, { [$style.mobileConversationOpen]: mobileConversationOpen }]">
			<aside :class="$style.roomPane">
				<header :class="$style.workspaceHeader">
					<div :class="$style.workspaceMark"><i class="ti ti-messages"></i></div>
					<button class="_button" :class="$style.accountSwitcher" :aria-label="`${i18n.ts.switchAccount}: ${session.userId} (${session.homeserverUrl})`" aria-haspopup="menu" :disabled="loggingOut" @click="showAccountMenu">
						<span :class="$style.workspaceIdentity">
							<strong>{{ session.userId }}</strong>
							<span>{{ session.homeserverUrl }}</span>
						</span>
						<i class="ti ti-chevron-down" aria-hidden="true"></i>
					</button>
					<button class="_button" :class="$style.iconButton" :aria-label="i18n.ts._matrix.disconnect" :disabled="loggingOut" @click="logout">
						<i class="ti ti-logout"></i>
					</button>
				</header>
				<div :class="$style.sidebarActions">
					<button class="_button" :class="$style.newMessageButton" @click="createDirectMessage">
						<i class="ti ti-edit"></i>
						<span>{{ i18n.ts._matrix.newDirectMessage }}</span>
					</button>
					<label :class="$style.roomSearch">
						<i class="ti ti-search" aria-hidden="true"></i>
						<span :class="$style.srOnly">{{ i18n.ts.search }}</span>
						<input v-model="roomSearch" type="search" :placeholder="i18n.ts.search">
					</label>
				</div>
				<template v-if="invites.length > 0">
					<div :class="$style.roomSectionHeader">
						<span><i class="ti ti-mail"></i> {{ i18n.ts._matrix.invites }}</span>
						<span>{{ invites.length }}</span>
					</div>
					<div :class="$style.inviteList">
						<div v-for="invite in invites" :key="invite.roomId" :class="$style.invite">
							<span :class="$style.roomCopy">
								<span :class="$style.roomName">{{ invite.name }}</span>
								<span :class="$style.roomTopic">{{ i18n.tsx._matrix.invitedBy({ user: invite.inviter }) }}</span>
							</span>
							<span :class="$style.inviteActions">
								<MkButton primary small :disabled="respondingInviteIds.includes(invite.roomId)" @click="respondToInvite(invite, true)">{{ i18n.ts._matrix.acceptInvite }}</MkButton>
								<MkButton small :disabled="respondingInviteIds.includes(invite.roomId)" @click="respondToInvite(invite, false)">{{ i18n.ts._matrix.declineInvite }}</MkButton>
							</span>
						</div>
					</div>
				</template>
				<div :class="$style.roomSectionHeader">
					<span><i class="ti ti-chevron-down"></i> {{ i18n.ts._matrix.rooms }}</span>
					<span>{{ filteredRooms.length }}</span>
				</div>
				<nav :class="$style.roomList" :aria-label="i18n.ts._matrix.rooms">
					<div v-if="initialSync && rooms.length === 0" :class="$style.empty"><MkLoading/></div>
					<div v-else-if="filteredRooms.length === 0" :class="$style.empty">{{ i18n.ts._matrix.noRooms }}</div>
					<button
						v-for="room in filteredRooms"
						:key="room.roomId"
						class="_button"
						:class="[$style.room, { [$style.selectedRoom]: selectedRoomId === room.roomId }]"
						:aria-pressed="selectedRoomId === room.roomId"
						@click="selectRoom(room.roomId)"
					>
						<span :class="$style.roomAvatar">{{ roomInitial(room.name) }}</span>
						<span :class="$style.roomCopy">
							<span :class="$style.roomName">{{ room.name }}</span>
							<span v-if="room.topic" :class="$style.roomTopic">{{ room.topic }}</span>
						</span>
						<i v-if="room.encrypted" class="ti ti-lock" :class="$style.roomLock" aria-hidden="true"></i>
						<span v-if="room.encrypted" :class="$style.srOnly">{{ i18n.ts._matrix.encryptedRoomUnsupported }}</span>
						<span v-if="room.unreadCount > 0" :class="$style.unread">{{ room.unreadCount }}</span>
					</button>
				</nav>
				<MkInfo v-if="connectionError" warn :class="$style.sidebarWarning">{{ connectionError }}</MkInfo>
				<footer :class="$style.sidebarFooter">
					<span role="status" aria-live="polite" :class="[$style.syncStatus, { [$style.syncing]: initialSync, [$style.syncError]: connectionError != null }]">
						<i v-if="initialSync" class="ti ti-loader-2" :class="$style.syncIndicator" aria-hidden="true"></i>
						<i v-else-if="connectionError" class="ti ti-alert-circle" :class="$style.syncIndicator" aria-hidden="true"></i>
						<span :class="$style.syncLabel">{{ initialSync ? i18n.ts._matrix.syncing : connectionError ? i18n.ts._matrix.connectionError : session.homeserverUrl }}</span>
					</span>
					<button v-if="!initialSync" class="_button" :class="$style.syncButton" :aria-label="i18n.ts._matrix.sync" :disabled="sending" @click="restartSync">
						<i class="ti ti-refresh"></i>
					</button>
				</footer>
			</aside>

			<section :class="$style.timelinePane">
				<template v-if="selectedRoom">
					<header :class="$style.roomHeader">
						<button class="_button" :class="$style.mobileBack" :aria-label="i18n.ts.goBack" @click="showRoomList">
							<i class="ti ti-chevron-left"></i>
						</button>
						<span :class="$style.headerAvatar">{{ roomInitial(selectedRoom.name) }}</span>
						<span :class="$style.roomHeaderCopy">
							<strong>{{ selectedRoom.name }}</strong>
							<small>{{ selectedRoom.topic ?? selectedRoom.roomId }}</small>
						</span>
						<i v-if="selectedRoom.encrypted" class="ti ti-lock" :class="$style.headerLock" aria-hidden="true"></i>
					</header>
					<MkInfo v-if="connectionError" warn :class="$style.conversationWarning">{{ connectionError }}</MkInfo>
					<MkInfo v-if="selectedRoom.encrypted" warn :class="$style.encryptionWarning">
						{{ i18n.ts._matrix.encryptedRoomUnsupported }}
					</MkInfo>
					<div ref="timelineEl" :class="$style.timeline" @scroll="onTimelineScroll">
						<div v-if="displayMessages.length === 0" :class="$style.empty">{{ i18n.ts._matrix.noMessages }}</div>
						<template v-for="message in displayMessages" :key="message.eventId">
							<div v-if="message.showDay" :class="$style.dayDivider"><span>{{ formatDay(message.timestamp) }}</span></div>
							<article
								:class="[$style.messageRow, { [$style.ownMessage]: message.own, [$style.groupedMessage]: !message.showHeader }]"
							>
								<span v-if="message.showHeader" :class="$style.messageAvatar">{{ roomInitial(message.sender) }}</span>
								<span v-else :class="$style.avatarSpacer"></span>
								<div :class="$style.messageContent">
									<div v-if="message.showHeader" :class="$style.messageMeta">
										<strong>{{ message.sender }}</strong>
										<time :datetime="new Date(message.timestamp).toISOString()">{{ formatTime(message.timestamp) }}</time>
									</div>
									<div :class="$style.messageBody">{{ message.body }}</div>
								</div>
							</article>
						</template>
					</div>
					<form :class="$style.composer" @submit.prevent="sendMessage">
						<textarea
							ref="composerInputEl"
							v-model="messageDraft"
							rows="1"
							:disabled="selectedRoom.encrypted || sending"
							:placeholder="i18n.ts._matrix.messagePlaceholder"
							:aria-label="i18n.ts._matrix.messagePlaceholder"
							@keydown="onComposerKeydown"
						></textarea>
						<button class="_button" :class="$style.sendButton" type="submit" :disabled="!canSend" :aria-label="i18n.ts._matrix.send">
							<MkLoading v-if="sending" :em="true"/>
							<i v-else class="ti ti-send"></i>
						</button>
					</form>
				</template>
				<div v-else :class="$style.emptyConversation">
					<div :class="$style.emptyConversationIcon"><i class="ti ti-messages"></i></div>
					<strong>{{ i18n.ts._matrix.noRooms }}</strong>
				</div>
			</section>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import type { MatrixSession } from './matrix-client.js';
import { matrixSessionKey } from './matrix-client.js';
import type { MatrixInvite, MatrixMessage } from './matrix-store.js';
import * as matrix from './matrix-store.js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import type { MenuItem } from '@/types/menu.js';

type DisplayMatrixMessage = MatrixMessage & {
	showHeader: boolean;
	showDay: boolean;
};

// Session, rooms and the sync loop live in the shared store so that the unified direct-message list
// and this view show the same conversations without running two syncs. Only view state stays local.
const sessions = matrix.sessions;
const session = matrix.session;
const rooms = matrix.rooms;
const invites = matrix.invites;
const messages = matrix.messages;
const initialSync = matrix.initialSync;
const connectionError = matrix.connectionError;

const homeserverUrl = ref(session.value?.homeserverUrl ?? 'https://matrix.org');
const userId = ref('');
const password = ref('');
const loggingIn = ref(false);
const loggingOut = ref(false);
const showLogin = ref(false);
const loginError = ref<string | null>(null);
const sending = ref(false);
const respondingInviteIds = ref<string[]>([]);
const selectedRoomId = ref<string | null>(null);
const messageDraft = ref('');
const roomSearch = ref('');
const mobileConversationOpen = ref(false);
const timelineEl = useTemplateRef('timelineEl');
const composerInputEl = useTemplateRef<HTMLTextAreaElement>('composerInputEl');

let sendOperation = 0;
let componentActive = true;
let stickToTimelineBottom = true;

const selectedRoom = computed(() => rooms.value.find(room => room.roomId === selectedRoomId.value) ?? null);
const selectedMessages = computed(() => selectedRoomId.value == null ? [] : messages.value[selectedRoomId.value] ?? []);
const filteredRooms = computed(() => {
	const query = roomSearch.value.trim().toLocaleLowerCase();
	if (query.length === 0) return rooms.value;
	return rooms.value.filter(room => [room.name, room.topic ?? '', room.roomId].join('\n').toLocaleLowerCase().includes(query));
});
const displayMessages = computed<DisplayMatrixMessage[]>(() => selectedMessages.value.map((message, index, source) => {
	const previous = source[index - 1];
	return {
		...message,
		showHeader: previous == null || previous.sender !== message.sender || message.timestamp - previous.timestamp > 5 * 60 * 1000,
		showDay: previous == null || new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString(),
	};
}));
const canSend = computed(() => messageDraft.value.trim().length > 0 && selectedRoom.value != null && !selectedRoom.value.encrypted && !sending.value);

matrix.acquireSync();

if (matrix.sessionExpired.value) {
	loginError.value = i18n.ts._matrix.sessionExpired;
	showLogin.value = true;
	matrix.sessionExpired.value = false;
}

watch(selectedMessages, async () => {
	await nextTick();
	if (stickToTimelineBottom && timelineEl.value) timelineEl.value.scrollTop = timelineEl.value.scrollHeight;
}, { deep: true });

watch(messageDraft, async () => {
	await nextTick();
	const element = composerInputEl.value;
	if (element == null) return;
	element.style.height = 'auto';
	element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
});

// A room joined from an invitation only exists once the next sync delivers it, so open it then.
watch(rooms, () => {
	const pendingRoomId = matrix.takePendingRoomId();
	if (pendingRoomId != null && rooms.value.some(room => room.roomId === pendingRoomId)) {
		selectRoom(pendingRoomId, false);
		return;
	}
	if (rooms.value.length === 0) mobileConversationOpen.value = false;
	if (selectedRoomId.value == null && rooms.value.length > 0) selectRoom(rooms.value[0]!.roomId, false);
}, { deep: true, immediate: true });

onBeforeUnmount(() => {
	componentActive = false;
	sendOperation++;
	matrix.releaseSync();
});

async function login() {
	if (loggingIn.value) return;
	loggingIn.value = true;
	loginError.value = null;
	try {
		await matrix.login(homeserverUrl.value, userId.value, password.value);
		password.value = '';
		if (!componentActive) return;
		selectedRoomId.value = null;
		showLogin.value = false;
	} catch (error) {
		loginError.value = matrix.reportError(i18n.ts._matrix.connectionError, error);
	} finally {
		loggingIn.value = false;
	}
}

function cancelAddAccount() {
	if (loggingIn.value || session.value == null) return;
	showLogin.value = false;
	loginError.value = null;
	password.value = '';
}

function beginAddAccount() {
	showLogin.value = true;
	loginError.value = null;
	userId.value = '';
	password.value = '';
}

function switchSession(nextSession: MatrixSession) {
	selectedRoomId.value = null;
	mobileConversationOpen.value = false;
	homeserverUrl.value = nextSession.homeserverUrl;
	matrix.activateSession(nextSession);
}

function showAccountMenu(event: PointerEvent) {
	const activeKey = session.value == null ? null : matrixSessionKey(session.value);
	const menu: MenuItem[] = [{
		type: 'label',
		text: i18n.ts.accounts,
	}, ...sessions.value.map(savedSession => ({
		text: savedSession.userId,
		caption: savedSession.homeserverUrl,
		icon: 'ti ti-user-circle',
		active: matrixSessionKey(savedSession) === activeKey,
		action: () => {
			if (matrixSessionKey(savedSession) !== activeKey) switchSession(savedSession);
		},
	})), {
		type: 'divider',
	}, {
		text: i18n.ts.addAccount,
		icon: 'ti ti-user-plus',
		action: beginAddAccount,
	}];
	os.popupMenu(menu, event.currentTarget ?? event.target);
}

async function respondToInvite(invite: MatrixInvite, accept: boolean) {
	if (respondingInviteIds.value.includes(invite.roomId)) return;
	respondingInviteIds.value = [...respondingInviteIds.value, invite.roomId];
	try {
		await matrix.respondToInvite(invite.roomId, accept);
	} catch (error) {
		connectionError.value = matrix.reportError(i18n.ts._matrix.connectionError, error);
	} finally {
		respondingInviteIds.value = respondingInviteIds.value.filter(roomId => roomId !== invite.roomId);
	}
}

function selectRoom(roomId: string, openConversation = true) {
	stickToTimelineBottom = true;
	if (selectedRoomId.value !== roomId) messageDraft.value = '';
	selectedRoomId.value = roomId;
	if (openConversation) mobileConversationOpen.value = true;
	matrix.markRoomAsRead(roomId);
}

function onTimelineScroll() {
	const element = timelineEl.value;
	if (element == null) return;
	stickToTimelineBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
}

function showRoomList() {
	mobileConversationOpen.value = false;
}

function restartSync() {
	if (sending.value) return;
	matrix.restartSync();
}

async function createDirectMessage() {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._matrix.newDirectMessage,
		text: i18n.ts._matrix.directMessageUserId,
		placeholder: '@user:example.com',
		minLength: 3,
	});
	if (canceled || !result) return;
	if (!componentActive) return;
	try {
		const roomId = await matrix.createDirectRoom(result);
		if (!componentActive || roomId == null) return;
		selectRoom(roomId);
	} catch (error) {
		if (componentActive) {
			await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.createRoomError, error) });
		}
	}
}

async function sendMessage() {
	if (!canSend.value || selectedRoomId.value == null) return;
	const roomId = selectedRoomId.value;
	const operation = ++sendOperation;
	const body = messageDraft.value.trim();
	sending.value = true;
	try {
		await matrix.sendText(roomId, body);
		if (operation === sendOperation) messageDraft.value = '';
	} catch (error) {
		if (operation === sendOperation) {
			await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.sendError, error) });
		}
	} finally {
		if (operation === sendOperation) sending.value = false;
	}
}

function onComposerKeydown(event: KeyboardEvent) {
	if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
	event.preventDefault();
	void sendMessage();
}

async function logout() {
	if (loggingOut.value || session.value == null) return;
	const activeSession = session.value;
	loggingOut.value = true;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.logout,
		text: i18n.ts._matrix.logoutConfirm,
	});
	loggingOut.value = false;
	if (canceled || session.value !== activeSession) return;

	selectedRoomId.value = null;
	mobileConversationOpen.value = false;
	await matrix.logout();
}

function formatTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function formatDay(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp);
}

function roomInitial(value: string): string {
	return Array.from(value.trim().replace(/^[@#!]/, ''))[0]?.toLocaleUpperCase() ?? 'M';
}
</script>

<style lang="scss" module>
.root {
	min-width: 0;
}

.loginShell {
	display: grid;
	grid-template-columns: minmax(280px, 0.85fr) minmax(360px, 1.15fr);
	max-width: 900px;
	margin: 36px auto;
	overflow: hidden;
}

.loginBrand {
	display: flex;
	flex-direction: column;
	justify-content: center;
	padding: 48px;
	color: var(--MI_THEME-fgOnAccent);
	background: linear-gradient(145deg, var(--MI_THEME-accent), color-mix(in srgb, var(--MI_THEME-accent) 55%, var(--MI_THEME-panel)));

	p {
		margin: 8px 0 0;
		line-height: 1.7;
		opacity: 0.86;
	}
}

.loginBrandIcon {
	display: grid;
	width: 56px;
	height: 56px;
	margin-bottom: 20px;
	font-size: 28px;
	background: color-mix(in srgb, var(--MI_THEME-fgOnAccent) 18%, transparent);
	border-radius: var(--MI-radius);
	place-items: center;
}

.loginForm {
	padding: 40px;
}

.loginActions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;

	> :last-child {
		flex: 1;
	}
}

.heading {
	margin: 0;
	font-size: 2em;
}

.client {
	display: grid;
	grid-template-columns: 310px minmax(0, 1fr);
	height: clamp(620px, calc(100dvh - 150px), 860px);
	min-height: 0;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
}

.roomPane {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
	background: color-mix(in srgb, var(--MI_THEME-panel) 90%, var(--MI_THEME-accent));
	border-right: solid 1px var(--MI_THEME-divider);
}

.workspaceHeader {
	display: flex;
	align-items: center;
	gap: 10px;
	height: 68px;
	padding: 0 14px;
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.workspaceMark,
.headerAvatar,
.roomAvatar,
.messageAvatar,
.emptyConversationIcon {
	display: grid;
	flex: 0 0 auto;
	color: var(--MI_THEME-fgOnAccent);
	font-weight: 700;
	background: var(--MI_THEME-accent);
	place-items: center;
}

.workspaceMark {
	width: 38px;
	height: 38px;
	font-size: 18px;
	border-radius: 10px;
}

.workspaceIdentity {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;

	strong,
	span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	span {
		color: var(--MI_THEME-fgTransparentWeak);
		font-size: 0.78em;
	}
}

.accountSwitcher {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 8px;
	min-width: 0;
	padding: 6px 8px;
	text-align: left;
	border-radius: 8px;

	> i {
		flex: 0 0 auto;
		color: var(--MI_THEME-fgTransparentWeak);
		font-size: 0.8em;
	}

	&:hover,
	&:focus-visible {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.iconButton {
	display: grid;
	flex: 0 0 auto;
	width: 34px;
	height: 34px;
	color: var(--MI_THEME-fgTransparentWeak);
	border-radius: 8px;
	place-items: center;

	&:hover,
	&:focus-visible {
		color: var(--MI_THEME-fg);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.sidebarActions {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
}

.newMessageButton {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	width: 100%;
	padding: 9px 12px;
	color: var(--MI_THEME-fgOnAccent);
	font-weight: 700;
	background: var(--MI_THEME-accent);
	border-radius: 9px;

	&:hover,
	&:focus-visible {
		filter: brightness(1.08);
	}
}

.roomSearch {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	color: var(--MI_THEME-fgTransparentWeak);
	background: var(--MI_THEME-bg);
	border: solid 1px var(--MI_THEME-inputBorder);
	border-radius: 8px;

	&:focus-within {
		border-color: var(--MI_THEME-accent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent);
	}

	input {
		width: 100%;
		min-width: 0;
		color: var(--MI_THEME-fg);
		font: inherit;
		background: none;
		border: 0;
		outline: 0;
	}
}

.roomSectionHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 16px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.8em;
	font-weight: 700;
}

.inviteList {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 0 16px 8px;
}

.invite {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
	border-radius: 8px;
	background: var(--MI_THEME-buttonBg);
}

.inviteActions {
	display: flex;
	gap: 8px;
}

.roomList {
	flex: 1;
	min-height: 0;
	padding: 0 8px 12px;
	overflow-y: auto;
}

.room {
	display: grid;
	grid-template-columns: 38px minmax(0, 1fr) auto auto;
	align-items: center;
	gap: 10px;
	width: 100%;
	margin: 2px 0;
	padding: 8px;
	text-align: left;
	border-radius: 9px;

	&:hover,
	&:focus-visible {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.selectedRoom {
		color: var(--MI_THEME-fgOnAccent);
		background: var(--MI_THEME-accent);

		.roomTopic,
		.roomLock {
			color: currentColor;
			opacity: 0.78;
		}

		.roomAvatar {
			color: var(--MI_THEME-accent);
			background: var(--MI_THEME-fgOnAccent);
		}
	}
}

.roomAvatar,
.headerAvatar,
.messageAvatar {
	width: 38px;
	height: 38px;
	border-radius: 10px;
}

.roomAvatar {
	background: color-mix(in srgb, var(--MI_THEME-accent) 78%, var(--MI_THEME-panel));
}

.roomCopy,
.roomHeaderCopy {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.roomName {
	overflow: hidden;
	font-weight: 700;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.roomTopic {
	overflow: hidden;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.78em;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.roomLock {
	grid-column: 3;
	grid-row: 1;
	color: var(--MI_THEME-fgTransparentWeak);
}

.srOnly {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	overflow: hidden;
	white-space: nowrap;
	border: 0;
	clip: rect(0, 0, 0, 0);
	clip-path: inset(50%);
}

.unread {
	grid-column: 4;
	min-width: 1.5em;
	padding: 2px 6px;
	color: var(--MI_THEME-fgOnAccent);
	font-size: 0.8em;
	text-align: center;
	background: var(--MI_THEME-accent);
	border-radius: 999px;
}

.sidebarFooter {
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 42px;
	padding: 5px 8px 5px 14px;
	border-top: solid 1px var(--MI_THEME-divider);
}

.sidebarWarning {
	margin: 8px 10px 0;
}

.syncStatus {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 6px;
	min-width: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.74em;

	&.syncing .syncIndicator {
		animation: spin 0.8s linear infinite;
	}

	&.syncError {
		color: var(--MI_THEME-error);
	}
}

.syncIndicator {
	flex: 0 0 auto;
	font-size: 0.95em;
}

.syncLabel {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.syncButton {
	display: grid;
	flex: 0 0 auto;
	width: 28px;
	height: 28px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	border-radius: 4px;
	place-items: center;

	&:hover,
	&:focus-visible {
		color: var(--MI_THEME-fg);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.syncing .syncIndicator {
		animation: none;
	}
}

.timelinePane {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
	overflow: hidden;
}

.roomHeader {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 11px;
	min-height: 68px;
	padding: 0 18px;
	background: var(--MI_THEME-panel);
	border-bottom: solid 1px var(--MI_THEME-divider);

	strong {
		overflow: hidden;
		font-size: 1.05em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	small {
		overflow: hidden;
		color: var(--MI_THEME-fgTransparentWeak);
		font-size: 0.76em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.mobileBack {
	display: none;
}

.headerLock {
	color: var(--MI_THEME-fgTransparentWeak);
}

.conversationWarning {
	display: none;
}

.encryptionWarning {
	margin: 10px 14px 0;
}

.timeline {
	flex: 1;
	min-height: 0;
	padding: 18px 22px 26px;
	overflow-y: auto;
	overscroll-behavior: contain;
}

.dayDivider {
	display: flex;
	align-items: center;
	gap: 12px;
	margin: 22px 0 18px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.75em;
	font-weight: 700;

	&::before,
	&::after {
		flex: 1;
		height: 1px;
		background: var(--MI_THEME-divider);
		content: '';
	}
}

.messageRow {
	display: grid;
	grid-template-columns: 38px minmax(0, 1fr);
	gap: 11px;
	margin: 14px -8px 0;
	padding: 3px 8px;
	border-radius: 8px;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
	}
}

.groupedMessage {
	margin-top: 1px;
}

.messageAvatar {
	font-size: 0.85em;
	border-radius: 8px;
}

.avatarSpacer {
	width: 38px;
}

.messageContent {
	min-width: 0;
}

.messageMeta {
	display: flex;
	align-items: baseline;
	gap: 12px;
	margin-bottom: 2px;

	strong {
		overflow-wrap: anywhere;
	}

	time {
		color: var(--MI_THEME-fgTransparentWeak);
		font-size: 0.72em;
	}
}

.messageBody {
	line-height: 1.55;
	overflow-wrap: anywhere;
	white-space: pre-wrap;
}

.composer {
	display: flex;
	flex: 0 0 auto;
	align-items: flex-end;
	gap: 8px;
	margin: 0 18px 16px;
	padding: 8px 8px 8px 14px;
	background: var(--MI_THEME-bg);
	border: solid 1px var(--MI_THEME-inputBorder);
	border-radius: var(--MI-radius);

	&:focus-within {
		border-color: var(--MI_THEME-accent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
	}

	textarea {
		box-sizing: border-box;
		flex: 1;
		min-width: 0;
		min-height: 34px;
		max-height: 140px;
		padding: 7px 0;
		overflow-y: auto;
		resize: none;
		color: var(--MI_THEME-fg);
		font: inherit;
		line-height: 1.4;
		background: none;
		border: 0;
		outline: 0;
	}
}

.sendButton {
	display: grid;
	flex: 0 0 auto;
	width: 38px;
	height: 38px;
	color: var(--MI_THEME-fgOnAccent);
	background: var(--MI_THEME-accent);
	border-radius: 9px;
	place-items: center;

	&:disabled {
		opacity: 0.45;
	}
}

.empty {
	display: grid;
	flex: 1;
	min-height: 140px;
	place-items: center;
	padding: 24px;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
}

.emptyConversation {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 14px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.emptyConversationIcon {
	width: 64px;
	height: 64px;
	font-size: 28px;
	border-radius: 18px;
}

@container (max-width: 700px) {
	.loginShell {
		grid-template-columns: 1fr;
		margin: 0;
	}

	.loginBrand {
		padding: 28px 24px;
	}

	.loginBrandIcon {
		width: 48px;
		height: 48px;
		margin-bottom: 14px;
	}

	.heading {
		font-size: 1.55em;
	}

	.loginForm {
		padding: 24px;
	}

	.client {
		display: grid;
		grid-template-columns: 1fr;
		height: calc(100dvh - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px) - 76px);
		min-height: 0;
		border-right: 0;
		border-left: 0;
		border-radius: 0;
	}

	.roomPane,
	.timelinePane {
		grid-column: 1;
		grid-row: 1;
	}

	.roomPane {
		border-right: 0;
	}

	.timelinePane {
		display: none;
		background: var(--MI_THEME-bg);
	}

	.conversationWarning {
		display: block;
		margin: 8px 12px 0;
	}

	.mobileConversationOpen {
		.roomPane {
			display: none;
		}

		.timelinePane {
			display: flex;
		}
	}

	.workspaceHeader {
		height: 62px;
		padding-right: 10px;
	}

	.sidebarActions {
		padding: 12px 14px;
	}

	.roomList {
		padding-right: 6px;
		padding-left: 6px;
	}

	.room {
		min-height: 62px;
		padding: 9px 10px;
	}

	.sidebarFooter {
		padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
	}

	.roomHeader {
		grid-template-columns: 36px 36px minmax(0, 1fr) auto;
		min-height: 58px;
		padding: 0 10px 0 6px;
	}

	.mobileBack {
		display: grid;
		width: 36px;
		height: 36px;
		font-size: 20px;
		border-radius: 50%;
		place-items: center;
	}

	.headerAvatar {
		width: 36px;
		height: 36px;
	}

	.timeline {
		padding: 12px 12px 20px;
	}

	.messageRow {
		grid-template-columns: 32px minmax(0, 1fr);
		max-width: 88%;
		margin-top: 10px;
		margin-right: auto;
		margin-left: 0;
		padding: 0;

		&:hover {
			background: none;
		}
	}

	.messageAvatar,
	.avatarSpacer {
		width: 32px;
		height: 32px;
	}

	.messageContent {
		padding: 8px 11px;
		background: var(--MI_THEME-panel);
		border-radius: 4px var(--MI-radius) var(--MI-radius) var(--MI-radius);
	}

	.groupedMessage {
		margin-top: 3px;

		.messageContent {
			border-radius: var(--MI-radius);
		}
	}

	.ownMessage {
		grid-template-columns: minmax(0, 1fr);
		margin-right: 0;
		margin-left: auto;

		.messageAvatar,
		.avatarSpacer {
			display: none;
		}

		.messageContent {
			color: var(--MI_THEME-fgOnAccent);
			background: var(--MI_THEME-accent);
			border-radius: var(--MI-radius) 4px var(--MI-radius) var(--MI-radius);
		}

		.messageMeta {
			justify-content: flex-end;

			time {
				color: currentColor;
				opacity: 0.72;
			}
		}
	}

	.dayDivider {
		margin: 18px 0 14px;
	}

	.composer {
		margin: 0;
		padding: 8px 10px max(8px, env(safe-area-inset-bottom, 0px)) 14px;
		background: var(--MI_THEME-panel);
		border-right: 0;
		border-bottom: 0;
		border-left: 0;
		border-radius: 0;

		&:focus-within {
			box-shadow: none;
		}
	}
}
</style>
