<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="480"
	:height="520"
	@close="dialog?.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts._matrix.deviceList }}</template>

	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<MkLoading v-if="loading"/>
		<MkInfo v-else-if="error" warn>{{ error }}</MkInfo>
		<div v-else class="_gaps_s">
			<div v-for="device in devices" :key="device.deviceId" class="_panel" :class="$style.device">
				<i :class="[$style.icon, device.verified ? $style.verified : $style.unverified]" class="ti" :data-verified="device.verified"></i>
				<div :class="$style.body">
					<div :class="$style.name">
						{{ device.displayName ?? device.deviceId }}
						<span v-if="device.current" :class="$style.badge">{{ i18n.ts._matrix.thisDevice }}</span>
					</div>
					<div :class="$style.meta">{{ device.deviceId }}</div>
					<!-- The fingerprint is what a person compares when verifying out of band. -->
					<div v-if="device.fingerprint" :class="$style.fingerprint">{{ i18n.ts._matrix.deviceFingerprint }}: {{ device.fingerprint }}</div>
				</div>
				<span :class="[$style.state, device.verified ? $style.verified : $style.unverified]">
					{{ device.verified ? i18n.ts._matrix.deviceVerified : i18n.ts._matrix.deviceUnverified }}
				</span>
			</div>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { onMounted, ref, useTemplateRef } from 'vue';
import type { DeviceSummary } from './matrix-store.js';
import * as matrix from './matrix-store.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');
const devices = ref<DeviceSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
	try {
		devices.value = await matrix.ownDevices();
	} catch (err) {
		error.value = matrix.reportError(i18n.ts._matrix.deviceLoadError, err);
	} finally {
		loading.value = false;
	}
});
</script>

<style lang="scss" module>
.device {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
}

.icon {
	flex-shrink: 0;

	&[data-verified="true"]::before {
		content: "\ea5e"; // ti-device-desktop-check
	}

	&[data-verified="false"]::before {
		content: "\eb15"; // ti-alert-triangle
	}
}

.body {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
}

.name {
	display: flex;
	align-items: center;
	gap: 6px;
	font-weight: 700;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.badge {
	flex-shrink: 0;
	padding: 1px 6px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.7em;
}

.meta, .fingerprint {
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow-wrap: anywhere;
}

.state {
	flex-shrink: 0;
	font-size: 0.8em;
	font-weight: 700;
}

.verified {
	color: var(--MI_THEME-success);
}

.unverified {
	color: var(--MI_THEME-warn);
}
</style>
