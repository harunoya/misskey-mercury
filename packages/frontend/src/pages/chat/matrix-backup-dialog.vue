<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="480" :height="520" :withOkButton="false" @close="close" @closed="emit('closed')">
	<template #header>{{ i18n.ts._matrix.keyBackup }}</template>
	<div class="_spacer">
		<div class="_gaps">
			<MkInfo warn>{{ i18n.ts._matrix.keyBackupDescription }}</MkInfo>
			<div v-if="recoveryKey" class="_panel" style="padding: 12px; word-break: break-all;">{{ recoveryKey }}</div>
			<MkInfo v-if="recoveryKey" warn>{{ i18n.ts._matrix.recoveryKeySaveWarning }}</MkInfo>
			<MkInput v-model="restoreInput" :placeholder="i18n.ts._matrix.restoreKeyBackupPrompt">
				<template #label>{{ i18n.ts._matrix.recoveryKey }}</template>
			</MkInput>
			<!-- Publishing cross-signing keys is guarded by user-interactive auth, so the
			     homeserver may ask for the account password before it accepts them. -->
			<MkInput v-model="accountPassword" type="password" autocomplete="current-password">
				<template #label>{{ i18n.ts._matrix.accountPassword }}</template>
				<template #caption>{{ i18n.ts._matrix.accountPasswordCaption }}</template>
			</MkInput>
			<div class="_buttons">
				<MkButton primary :wait="busy" @click="create">{{ i18n.ts._matrix.keyBackupCreate }}</MkButton>
				<MkButton :disabled="restoreInput.trim().length === 0" :wait="busy" @click="restore">{{ i18n.ts._matrix.keyBackupRestore }}</MkButton>
			</div>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import * as matrix from './matrix-store.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const busy = ref(false);
const recoveryKey = ref('');
const restoreInput = ref('');
const accountPassword = ref('');

async function create() {
	busy.value = true;
	try {
		recoveryKey.value = await matrix.setupKeyBackup(accountPassword.value.trim() || undefined);
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.keyBackup, error) });
	} finally {
		busy.value = false;
	}
}

async function restore() {
	busy.value = true;
	try {
		await matrix.restoreKeyBackup(restoreInput.value.trim(), accountPassword.value.trim() || undefined);
		close();
	} catch (error) {
		await os.alert({ type: 'error', text: matrix.reportError(i18n.ts._matrix.keyBackupRestore, error) });
	} finally {
		busy.value = false;
	}
}

function close() {
	dialogEl.value?.close();
}
</script>
