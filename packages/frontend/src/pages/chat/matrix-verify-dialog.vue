<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="440" :height="480" :withOkButton="false" @close="close" @closed="emit('closed')">
	<template #header>{{ i18n.ts._matrix.verifyDevices }}</template>
	<div class="_spacer">
		<div class="_gaps">
			<MkInfo>{{ i18n.ts._matrix.verifyDevicesDescription }}</MkInfo>
			<div v-if="sas" :class="$style.emojis" role="list">
				<span v-for="(pair, index) in sas.emojis" :key="index" :class="$style.emoji" :title="pair[1]">{{ pair[0] }}</span>
			</div>
			<div class="_buttons">
				<MkButton v-if="sas == null" primary :wait="starting" @click="start">{{ i18n.ts._matrix.verifyDevices }}</MkButton>
				<template v-else>
					<MkButton primary @click="confirm">{{ i18n.ts._matrix.sasMatch }}</MkButton>
					<MkButton danger @click="mismatch">{{ i18n.ts._matrix.sasMismatch }}</MkButton>
				</template>
			</div>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import * as matrix from './matrix-store.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const starting = ref(false);
const sas = computed(() => matrix.sasChallenge.value);

async function start() {
	starting.value = true;
	try {
		await matrix.startOwnVerification();
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.verificationFailed, error) });
	} finally {
		starting.value = false;
	}
}

async function confirm() {
	try {
		await sas.value?.confirm();
		matrix.clearSasChallenge();
		await os.alert({ type: 'success', text: i18n.ts._matrix.verificationSuccess });
		close();
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.verificationFailed, error) });
	}
}

function mismatch() {
	sas.value?.mismatch();
	matrix.clearSasChallenge();
	close();
}

function close() {
	sas.value?.cancel();
	matrix.clearSasChallenge();
	dialogEl.value?.close();
}
</script>

<style lang="scss" module>
.emojis {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: center;
	font-size: 2em;
}

.emoji {
	padding: 8px;
}
</style>
