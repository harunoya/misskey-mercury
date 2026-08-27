<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="$style.root" :style="{ width: `${size}px`, height: `${size}px` }" :title="name">
	<!-- Matrix media is behind the access token, so the thumbnail is fetched and shown as a blob. -->
	<img v-if="url" :src="url" :alt="name" :class="$style.image">
	<span v-else aria-hidden="true">{{ initial }}</span>
</span>
</template>

<script lang="ts" setup>
import { computed, shallowRef, watch } from 'vue';
import * as matrix from './matrix-store.js';

const props = withDefaults(defineProps<{
	name: string;
	mxcUrl?: string;
	size?: number;
}>(), {
	size: 36,
});

const url = shallowRef<string | null>(null);

const initial = computed(() => {
	// Matrix ids start with a sigil that says nothing about who this is.
	const trimmed = props.name.replace(/^[@!#]/, '').trim();
	return [...trimmed][0]?.toUpperCase() ?? '?';
});

watch(() => [props.mxcUrl, props.size] as const, async ([mxcUrl, size]) => {
	url.value = null;
	if (mxcUrl == null) return;
	const scale = window.devicePixelRatio > 1 ? 2 : 1;
	url.value = await matrix.resolveMediaUrl(mxcUrl, { width: size * scale, height: size * scale });
}, { immediate: true });
</script>

<style lang="scss" module>
.root {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	border-radius: 50%;
	overflow: hidden;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: 700;
	user-select: none;
}

.image {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
</style>
