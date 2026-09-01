<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div v-if="message.attachment && message.kind === 'image'" :class="$style.media">
		<!-- Matrix media needs the access token, so the blob is fetched first and handed over here. -->
		<img
			v-if="mediaUrl"
			:src="mediaUrl"
			:alt="message.attachment.fileName"
			:width="message.attachment.width"
			:height="message.attachment.height"
			:class="$style.image"
			loading="lazy"
			@click="openOriginal"
		>
		<MkLoading v-else-if="loadingMedia"/>
		<a v-else class="_link" :class="$style.fallbackLink" @click="download">{{ message.attachment.fileName }}</a>
	</div>

	<div v-else-if="message.attachment && message.kind === 'video'" :class="$style.media">
		<video v-if="mediaUrl" :src="mediaUrl" :class="$style.video" controls preload="metadata"></video>
		<MkLoading v-else-if="loadingMedia"/>
		<a v-else class="_link" :class="$style.fallbackLink" @click="download">{{ message.attachment.fileName }}</a>
	</div>

	<div v-else-if="message.attachment && message.kind === 'audio'" :class="$style.media">
		<audio v-if="mediaUrl" :src="mediaUrl" :class="$style.audio" controls preload="metadata"></audio>
		<MkLoading v-else-if="loadingMedia"/>
		<a v-else class="_link" :class="$style.fallbackLink" @click="download">{{ message.attachment.fileName }}</a>
	</div>

	<button v-else-if="message.attachment" class="_button" :class="$style.file" @click="download">
		<i class="ti ti-file" aria-hidden="true"></i>
		<span :class="$style.fileMeta">
			<span :class="$style.fileName">{{ message.attachment.fileName }}</span>
			<span v-if="fileSize" :class="$style.fileSize">{{ fileSize }}</span>
		</span>
		<i class="ti ti-download" aria-hidden="true"></i>
	</button>

	<p v-if="message.undecryptable" :class="[$style.body, $style.removed]">{{ i18n.ts._matrix.undecryptableMessage }}</p>
	<p v-else-if="showBody" :class="[$style.body, { [$style.emote]: message.kind === 'emote', [$style.notice]: message.kind === 'notice', [$style.removed]: message.redacted }]">
		<span v-if="message.kind === 'emote'">{{ message.senderName }} </span>{{ message.body }}
	</p>

	<div v-if="message.edited || message.pending || message.failed" :class="$style.state">
		<span v-if="message.failed" :class="$style.failed">{{ i18n.ts._matrix.sendFailed }}</span>
		<span v-else-if="message.pending"><MkLoading :em="true"/></span>
		<span v-else>{{ i18n.ts._matrix.edited }}</span>
	</div>

	<div v-if="message.reactions.length > 0" :class="$style.reactions">
		<button
			v-for="reaction in message.reactions"
			:key="reaction.key"
			class="_button"
			:class="[$style.reaction, { [$style.mine]: reaction.mine }]"
			:aria-pressed="reaction.mine"
			@click="emit('react', reaction.key)"
		>
			<span>{{ reaction.key }}</span>
			<span :class="$style.reactionCount">{{ reaction.count }}</span>
		</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, shallowRef, watch } from 'vue';
import type { MatrixMessage } from './matrix-store.js';
import * as matrix from './matrix-store.js';
import { i18n } from '@/i18n.js';
import bytes from '@/filters/bytes.js';

const props = defineProps<{
	message: MatrixMessage;
}>();

const emit = defineEmits<{
	(ev: 'react', key: string): void;
}>();

const mediaUrl = shallowRef<string | null>(null);
const loadingMedia = shallowRef(false);

// A message with an attachment usually has the file name as its body, which would be shown twice.
const showBody = computed(() => props.message.attachment == null || props.message.body !== props.message.attachment.fileName);
const fileSize = computed(() => (props.message.attachment?.size != null ? bytes(props.message.attachment.size) : null));

watch(() => props.message.attachment?.mxcUrl, async (mxcUrl) => {
	mediaUrl.value = null;
	if (mxcUrl == null) return;
	loadingMedia.value = true;
	try {
		mediaUrl.value = await matrix.resolveMediaUrl(mxcUrl);
	} finally {
		loadingMedia.value = false;
	}
}, { immediate: true });

function openOriginal() {
	if (mediaUrl.value != null) window.open(mediaUrl.value, '_blank', 'noopener');
}

async function download() {
	const attachment = props.message.attachment;
	if (attachment == null) return;
	const url = mediaUrl.value ?? await matrix.resolveMediaUrl(attachment.mxcUrl);
	if (url == null) return;
	const link = window.document.createElement('a');
	link.href = url;
	link.download = attachment.fileName;
	link.click();
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
}

.body {
	margin: 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.emote {
	font-style: italic;
}

.notice {
	color: var(--MI_THEME-fgTransparentWeak);
}

.removed {
	font-style: italic;
	color: var(--MI_THEME-fgTransparentWeak);
}

.media {
	max-width: 100%;
}

.image {
	max-width: min(100%, 360px);
	max-height: 320px;
	width: auto;
	height: auto;
	border-radius: 8px;
	cursor: zoom-in;
	display: block;
}

.video {
	max-width: min(100%, 360px);
	border-radius: 8px;
	display: block;
}

.audio {
	width: min(100%, 360px);
}

.fallbackLink {
	overflow-wrap: anywhere;
}

.file {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-buttonBg);
	text-align: left;
	max-width: 100%;
}

.fileMeta {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
}

.fileName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.fileSize {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.state {
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.failed {
	color: var(--MI_THEME-error);
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.reaction {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	font-size: 0.9em;
}

.mine {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.reactionCount {
	font-variant-numeric: tabular-nums;
}
</style>
