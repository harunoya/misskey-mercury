<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions">
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="_gaps">
			<MkInfo v-if="!matrix.isSignedIn.value" warn>{{ i18n.ts._matrix.notConnected }}</MkInfo>

			<template v-else-if="room == null">
				<MkLoading v-if="matrix.initialSync.value"/>
				<MkResult v-else type="notFound"/>
			</template>

			<template v-else>
				<MkInfo v-if="room.encrypted && matrix.cryptoUnavailable.value" warn>{{ i18n.ts._matrix.encryptedRoomUnsupported }}</MkInfo>
				<MkInfo v-else-if="room.encrypted">{{ i18n.ts._matrix.encryptedRoom }}</MkInfo>
				<MkInfo v-if="matrix.unverifiedDeviceCount.value > 0" warn>{{ i18n.tsx._matrix.unverifiedDevices({ count: matrix.unverifiedDeviceCount.value }) }}</MkInfo>
				<MkInfo v-if="matrix.connectionError.value" warn>{{ matrix.connectionError.value }}</MkInfo>

				<div ref="timelineEl" :class="$style.timeline">
					<div :class="$style.history">
						<MkButton v-if="hasMore" small :wait="loadingHistory" @click="loadOlder">{{ i18n.ts._matrix.loadOlder }}</MkButton>
						<span v-else-if="roomMessages.length > 0" :class="$style.historyEnd">{{ i18n.ts._matrix.noMoreHistory }}</span>
					</div>

					<div v-if="roomMessages.length === 0" :class="$style.empty">{{ i18n.ts._matrix.noMessages }}</div>

					<article
						v-for="message in roomMessages"
						:key="message.eventId"
						:data-event-id="message.eventId"
						:class="[$style.message, { [$style.own]: message.own }]"
						@contextmenu.prevent="openMessageMenu(message, $event)"
					>
						<MatrixAvatar :name="message.senderName" :mxcUrl="message.senderAvatarUrl" :size="36"/>
						<div :class="$style.messageMain">
							<div :class="$style.messageMeta">
								<span :class="$style.messageSender">{{ message.own ? i18n.ts.you : message.senderName }}</span>
								<MkTime :time="message.timestamp" :class="$style.messageTime"/>
								<button class="_button" :class="$style.messageMenu" :aria-label="i18n.ts.menu" @click.stop="openMessageMenu(message, $event)">
									<i class="ti ti-dots"></i>
								</button>
							</div>
							<!-- The quoted message is shown above the reply, so its body no longer repeats it. -->
							<button v-if="message.replyTo" class="_button" :class="$style.quote" @click="scrollToMessage(message.replyTo.eventId)">
								<span v-if="message.replyTo.senderName" :class="$style.quoteSender">{{ message.replyTo.senderName }}</span>
								<span :class="$style.quoteBody">{{ message.replyTo.body }}</span>
							</button>
							<MatrixMessage :message="message" @react="key => react(message, key)"/>
							<div v-if="message.failed" :class="$style.retry">
								<MkButton small primary @click="retry(message)">{{ i18n.ts._matrix.retrySend }}</MkButton>
								<MkButton small @click="matrix.discardFailedSend(props.matrixRoomId, message.eventId)">{{ i18n.ts._matrix.discardMessage }}</MkButton>
							</div>
						</div>
					</article>
				</div>

				<div v-if="typingLabel" :class="$style.typing" role="status" aria-live="polite">{{ typingLabel }}</div>

				<form :class="$style.composer" @submit.prevent="send">
					<div v-if="replyTarget" :class="$style.replyBar">
						<i class="ti ti-corner-up-left" aria-hidden="true"></i>
						<span :class="$style.replyBarText">{{ i18n.tsx._matrix.replyingTo({ user: replyTarget.senderName }) }}: {{ replyTarget.body }}</span>
						<button class="_button" :aria-label="i18n.ts._matrix.cancelReply" @click="replyTarget = null"><i class="ti ti-x"></i></button>
					</div>
					<MkTextarea v-model="draft" :disabled="encryptionBlocked || sending" :placeholder="i18n.ts._matrix.messagePlaceholder" @keydown="onComposerKeydown" @update:modelValue="onDraftInput"/>
					<div :class="$style.composerActions">
						<MkButton :disabled="encryptionBlocked || sending" @click="pickFile">
							<i class="ti ti-paperclip"></i> {{ i18n.ts._matrix.attachFile }}
						</MkButton>
						<MkButton primary :disabled="!canSend" :wait="sending" type="submit">{{ i18n.ts._matrix.send }}</MkButton>
					</div>
				</form>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import MatrixAvatar from './matrix-avatar.vue';
import MatrixMessage from './matrix-message.vue';
import type { MatrixMessage as MatrixMessageEntry, MatrixReplyTarget } from './matrix-store.js';
import * as matrix from './matrix-store.js';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { selectFile } from '@/utility/drive.js';
import type { MenuItem } from '@/types/menu.js';

const props = defineProps<{
	matrixRoomId: string;
}>();

const draft = ref('');
const sending = ref(false);
const replyTarget = ref<MatrixReplyTarget | null>(null);
const timelineEl = useTemplateRef('timelineEl');

const room = computed(() => matrix.rooms.value.find(item => item.roomId === props.matrixRoomId) ?? null);
const roomMessages = computed(() => matrix.messages.value[props.matrixRoomId] ?? []);
const hasMore = computed(() => matrix.hasMoreHistory.value[props.matrixRoomId] === true);
const loadingHistory = computed(() => matrix.loadingHistory.value[props.matrixRoomId] === true);
const encryptionBlocked = computed(() => room.value?.encrypted === true && matrix.cryptoUnavailable.value);
const canSend = computed(() => draft.value.trim().length > 0 && room.value != null && !encryptionBlocked.value && !sending.value);

const typingLabel = computed(() => {
	const users = matrix.typing.value[props.matrixRoomId] ?? [];
	if (users.length === 0) return null;
	const members = matrix.members.value[props.matrixRoomId] ?? {};
	if (users.length === 1) return i18n.tsx._matrix.typingOne({ user: members[users[0]!]?.displayName ?? users[0]! });
	return i18n.tsx._matrix.typingMany({ count: users.length });
});

// The conversation reads from the shared store, so it needs the sync running while it is open.
//
// Paired with the mount rather than taken during setup: `onBeforeUnmount` only runs for a component
// that actually mounted, so a setup whose component was discarded before mounting used to take a
// reference it never gave back, and the long poll then ran for the rest of the session.
onMounted(() => {
	matrix.acquireSync();
	matrix.markRoomAsRead(props.matrixRoomId);
});
onUnmounted(() => {
	matrix.stopTyping(props.matrixRoomId);
	matrix.releaseSync();
});

// The router reuses this component when only the room id changes, so switching conversations does
// not remount. Without this the previous room was left showing us as typing, and the new one was
// never marked as read.
watch(() => props.matrixRoomId, (roomId, previousRoomId) => {
	if (previousRoomId != null) matrix.stopTyping(previousRoomId);
	replyTarget.value = null;
	draft.value = '';
	matrix.markRoomAsRead(roomId);
});

watch(roomMessages, async () => {
	// Only follow the conversation when the reader is already at the bottom; snapping them back
	// down would fight with reading history.
	const el = timelineEl.value;
	const atBottom = el == null || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
	await nextTick();
	if (el && atBottom) el.scrollTop = el.scrollHeight;
	matrix.markRoomAsRead(props.matrixRoomId);
}, { deep: true });

function onComposerKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
		ev.preventDefault();
		void send();
	}
}

function onDraftInput() {
	if (draft.value.length > 0) matrix.notifyTyping(props.matrixRoomId);
	else matrix.stopTyping(props.matrixRoomId);
}

async function loadOlder() {
	const el = timelineEl.value;
	const before = el?.scrollHeight ?? 0;
	try {
		await matrix.loadOlderMessages(props.matrixRoomId);
		await nextTick();
		// Keep the reader looking at the same message rather than jumping to the new top.
		if (el) el.scrollTop += el.scrollHeight - before;
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.historyError, error) });
	}
}

async function send() {
	if (!canSend.value) return;
	const body = draft.value.trim();
	sending.value = true;
	try {
		draft.value = '';
		const replyingTo = replyTarget.value ?? undefined;
		replyTarget.value = null;
		matrix.stopTyping(props.matrixRoomId);
		await matrix.sendText(props.matrixRoomId, body, replyingTo);
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.sendError, error) });
	} finally {
		sending.value = false;
	}
}

async function pickFile(ev: MouseEvent) {
	const file = await selectFile({ multiple: false, anchorElement: ev.currentTarget ?? ev.target, label: i18n.ts._matrix.attachFile });
	// Matrix has no access to Misskey's drive, so the bytes are re-uploaded to the homeserver.
	const response = await window.fetch(file.url);
	const blob = await response.blob();
	sending.value = true;
	try {
		await matrix.sendFile(props.matrixRoomId, new File([blob], file.name, { type: file.type }));
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.uploadError, error) });
	} finally {
		sending.value = false;
	}
}

async function retry(message: MatrixMessageEntry) {
	try {
		await matrix.retrySend(props.matrixRoomId, message.eventId);
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.sendError, error) });
	}
}

/** Brings the quoted message into view, so a reply can be read in context. */
function scrollToMessage(eventId: string) {
	const el = timelineEl.value?.querySelector(`[data-event-id="${CSS.escape(eventId)}"]`);
	el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function react(message: MatrixMessageEntry, key: string) {
	try {
		await matrix.toggleReaction(props.matrixRoomId, message.eventId, key);
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.reactionError, error) });
	}
}

function openMessageMenu(message: MatrixMessageEntry, ev: MouseEvent) {
	if (message.redacted || message.pending === true) return;
	const anchor = (ev.currentTarget ?? ev.target) as HTMLElement;
	const items: MenuItem[] = [{
		text: i18n.ts._matrix.reply,
		icon: 'ti ti-corner-up-left',
		action: () => {
			replyTarget.value = { eventId: message.eventId, senderName: message.senderName, body: message.body };
		},
	}, {
		text: i18n.ts._matrix.addReaction,
		icon: 'ti ti-mood-plus',
		action: async () => {
			const reaction = await os.pickEmoji(anchor, { showPinned: false });
			if (reaction != null) await react(message, reaction);
		},
	}, {
		text: i18n.ts.copy,
		icon: 'ti ti-copy',
		action: () => { void window.navigator.clipboard.writeText(message.body); },
	}];

	if (message.own && message.kind === 'text') {
		items.push({
			text: i18n.ts._matrix.editMessage,
			icon: 'ti ti-pencil',
			action: async () => {
				const { canceled, result } = await os.inputText({ text: i18n.ts._matrix.editMessage, default: message.body });
				if (canceled || result.trim().length === 0) return;
				try {
					await matrix.editMessage(props.matrixRoomId, message.eventId, result.trim());
				} catch (error) {
					await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.editError, error) });
				}
			},
		});
	}

	if (message.own) {
		items.push({
			text: i18n.ts._matrix.deleteMessage,
			icon: 'ti ti-trash',
			danger: true,
			action: async () => {
				const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._matrix.deleteMessageConfirm });
				if (canceled) return;
				try {
					await matrix.deleteMessage(props.matrixRoomId, message.eventId);
				} catch (error) {
					await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.deleteError, error) });
				}
			},
		});
	}

	os.popupMenu(items, anchor);
}

const headerActions = computed(() => []);

definePage(() => ({
	title: room.value?.name ?? i18n.ts._matrix.title,
	icon: 'ti ti-messages',
}));
</script>

<style lang="scss" module>
.timeline {
	display: flex;
	flex-direction: column;
	gap: 12px;
	max-height: 60vh;
	overflow-y: auto;
}

.history {
	display: flex;
	justify-content: center;
	padding: 4px 0;
}

.historyEnd {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.empty {
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.message {
	display: flex;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 12px;
	background: var(--MI_THEME-panel);
}

.own {
	background: var(--MI_THEME-accentedBg);
}

.messageMain {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
}

.messageMeta {
	display: flex;
	gap: 8px;
	align-items: baseline;
	margin-bottom: 4px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.messageSender {
	font-weight: 700;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.messageTime {
	margin-left: auto;
}

.messageMenu {
	opacity: 0.6;

	&:hover, &:focus-visible {
		opacity: 1;
	}
}

.quote {
	display: flex;
	flex-direction: column;
	gap: 2px;
	margin-bottom: 6px;
	padding: 4px 10px;
	border-left: 3px solid var(--MI_THEME-accent);
	background: var(--MI_THEME-buttonBg);
	border-radius: 0 6px 6px 0;
	text-align: left;
	max-width: 100%;
}

.quoteSender {
	font-size: 0.8em;
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.quoteBody {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.retry {
	display: flex;
	gap: 6px;
	margin-top: 6px;
}

.replyBar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 10px;
	border-radius: 8px;
	background: var(--MI_THEME-buttonBg);
	font-size: 0.85em;
}

.replyBarText {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.typing {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.composer {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.composerActions {
	display: flex;
	gap: 8px;
	justify-content: flex-end;
}
</style>
