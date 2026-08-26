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
				<MkInfo v-if="room.encrypted" warn>{{ i18n.ts._matrix.encryptedRoomUnsupported }}</MkInfo>
				<MkInfo v-if="matrix.connectionError.value" warn>{{ matrix.connectionError.value }}</MkInfo>

				<div v-if="roomMessages.length === 0" style="text-align: center;">{{ i18n.ts._matrix.noMessages }}</div>

				<div v-else ref="timelineEl" :class="$style.timeline">
					<div v-for="message in roomMessages" :key="message.eventId" :class="[$style.message, { [$style.own]: message.own }]">
						<div :class="$style.messageMeta">
							<span :class="$style.messageSender">{{ message.own ? i18n.ts.you : message.sender }}</span>
							<MkTime :time="message.timestamp" :class="$style.messageTime"/>
						</div>
						<div :class="$style.messageBody">{{ message.body }}</div>
					</div>
				</div>

				<form :class="$style.composer" @submit.prevent="send">
					<MkTextarea v-model="draft" :disabled="room.encrypted || sending" :placeholder="i18n.ts._matrix.messagePlaceholder" @keydown="onComposerKeydown"/>
					<MkButton primary :disabled="!canSend" :wait="sending" type="submit">{{ i18n.ts._matrix.send }}</MkButton>
				</form>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import * as matrix from './matrix-store.js';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';

const props = defineProps<{
	matrixRoomId: string;
}>();

const draft = ref('');
const sending = ref(false);
const timelineEl = useTemplateRef('timelineEl');

const room = computed(() => matrix.rooms.value.find(item => item.roomId === props.matrixRoomId) ?? null);
const roomMessages = computed(() => matrix.messages.value[props.matrixRoomId] ?? []);
const canSend = computed(() => draft.value.trim().length > 0 && room.value != null && !room.value.encrypted && !sending.value);

// The conversation reads from the shared store, so it needs the sync running while it is open.
matrix.acquireSync();
onBeforeUnmount(() => matrix.releaseSync());

onMounted(() => matrix.markRoomAsRead(props.matrixRoomId));

watch(roomMessages, async () => {
	await nextTick();
	if (timelineEl.value) timelineEl.value.scrollTop = timelineEl.value.scrollHeight;
	matrix.markRoomAsRead(props.matrixRoomId);
}, { deep: true });

function onComposerKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
		ev.preventDefault();
		void send();
	}
}

async function send() {
	if (!canSend.value) return;
	const body = draft.value.trim();
	sending.value = true;
	try {
		await matrix.sendText(props.matrixRoomId, body);
		draft.value = '';
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.sendError, error) });
	} finally {
		sending.value = false;
	}
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

.message {
	padding: 10px 12px;
	border-radius: 12px;
	background: var(--MI_THEME-panel);
}

.own {
	background: var(--MI_THEME-accentedBg);
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
}

.messageTime {
	margin-left: auto;
}

.messageBody {
	white-space: pre-wrap;
	word-break: break-word;
}

.composer {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
</style>
