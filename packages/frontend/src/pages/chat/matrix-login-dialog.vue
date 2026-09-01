<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="420"
	:height="500"
	@close="dialog?.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts._matrix.connect }}</template>

	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<form class="_gaps_m" @submit.prevent="connect">
			<MkInfo>{{ i18n.ts._matrix.directBrowserNotice }}</MkInfo>

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
			<MkInfo v-if="error" warn>{{ error }}</MkInfo>

			<MkButton type="submit" primary full :wait="connecting">
				{{ connecting ? i18n.ts._matrix.connecting : i18n.ts._matrix.connect }}
			</MkButton>
		</form>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import * as matrix from './matrix-store.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';

const emit = defineEmits<{
	(ev: 'done'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

// Offered as a starting point rather than left blank: the field wants an origin, which is not the
// obvious thing to type when you only know your own Matrix id.
const homeserverUrl = ref(matrix.session.value?.homeserverUrl ?? 'https://matrix.org');
const userId = ref('');
const password = ref('');
const connecting = ref(false);
const error = ref<string | null>(null);

async function connect() {
	if (connecting.value) return;
	connecting.value = true;
	error.value = null;
	try {
		await matrix.login(homeserverUrl.value, userId.value, password.value);
		password.value = '';
		emit('done');
		dialog.value?.close();
	} catch (err) {
		error.value = matrix.reportError(i18n.ts._matrix.connectionError, err);
	} finally {
		connecting.value = false;
	}
}
</script>
