<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/linked-accounts" :label="i18n.ts._settings.linkedAccounts" :keywords="['linked', 'account', 'sub']" icon="ti ti-users-group">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/fluent-emoji/1f517.png" color="#4dabf7">
			<SearchText>{{ i18n.ts._settings.linkedAccountsBanner }}</SearchText>
		</MkFeatureBanner>

		<MkLoading v-if="fetching"/>

		<template v-else-if="state.linkedTo != null">
			<SearchMarker :keywords="['linked', 'main']">
				<FormSection first>
					<MkA :class="$style.userItemMainBody" :to="userPage(state.linkedTo)">
						<MkUserCardMini :user="state.linkedTo"/>
					</MkA>
					<template #description>{{ i18n.tsx._linkedAccounts.linkedToDescription({ name: state.linkedTo.username }) }}</template>
				</FormSection>
			</SearchMarker>

			<SearchMarker :keywords="['unlink']">
				<FormSection>
					<MkButton danger @click="unlinkSelf">
						<SearchLabel>{{ i18n.ts._linkedAccounts.unlinkSelf }}</SearchLabel>
					</MkButton>
				</FormSection>
			</SearchMarker>
		</template>

		<template v-else>
			<SearchMarker :keywords="['sub', 'account']">
				<FormSection first>
					<template #label><SearchLabel>{{ i18n.ts._linkedAccounts.subAccountsTitle }}</SearchLabel></template>

					<MkResult v-if="state.subAccounts.length === 0" type="empty" :text="i18n.ts._linkedAccounts.noSubAccounts"/>
					<div v-else class="_gaps_s">
						<div v-for="user in state.subAccounts" :key="user.id" :class="$style.userItem">
							<MkA :class="$style.userItemMainBody" :to="userPage(user)">
								<MkUserCardMini :user="user"/>
							</MkA>
							<button class="_button" :class="$style.remove" :aria-label="i18n.ts._linkedAccounts.unlink" @click="unlinkSub(user)"><i class="ti ti-x"></i></button>
						</div>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker :keywords="['link', 'existing']">
				<FormSection>
					<template #label><SearchLabel>{{ i18n.ts._linkedAccounts.linkExisting }}</SearchLabel></template>
					<template #description>{{ i18n.ts._linkedAccounts.linkExistingDescription }}</template>

					<div class="_gaps_s">
						<MkInput v-model="linkUsername">
							<template #label>{{ i18n.ts._linkedAccounts.targetUsername }}</template>
							<template #prefix>@</template>
						</MkInput>
						<MkInput v-model="linkPassword" type="password" autocomplete="current-password">
							<template #label>{{ i18n.ts._linkedAccounts.targetPassword }}</template>
						</MkInput>
						<MkButton primary :disabled="linkUsername === '' || linkPassword === ''" @click="linkExisting">{{ i18n.ts._linkedAccounts.linkButton }}</MkButton>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker :keywords="['create', 'sub', 'account']">
				<FormSection>
					<template #label><SearchLabel>{{ i18n.ts._linkedAccounts.createSub }}</SearchLabel></template>
					<template #description>{{ i18n.ts._linkedAccounts.createSubDescription }}</template>

					<div class="_gaps_s">
						<MkInput v-model="newSubUsername">
							<template #label>{{ i18n.ts._linkedAccounts.newSubUsername }}</template>
							<template #prefix>@</template>
						</MkInput>
						<MkButton primary :disabled="newSubUsername === ''" @click="createSub">{{ i18n.ts._linkedAccounts.createButton }}</MkButton>
					</div>
				</FormSection>
			</SearchMarker>
		</template>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import * as Misskey from 'misskey-js';
import FormSection from '@/components/form/section.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const fetching = ref(true);
const state = reactive<{
	linkedTo: Misskey.entities.UserLite | null;
	subAccounts: Misskey.entities.UserLite[];
}>({
	linkedTo: null,
	subAccounts: [],
});

const linkUsername = ref('');
const linkPassword = ref('');
const newSubUsername = ref('');

async function fetchState() {
	fetching.value = true;
	try {
		const res = await misskeyApi('i/linked-accounts/list', {});
		state.linkedTo = res.linkedTo;
		state.subAccounts = res.subAccounts;
	} finally {
		fetching.value = false;
	}
}

fetchState();

async function promptNewPasswordForUnlink() {
	const { canceled, result: newPassword } = await os.inputText({
		title: i18n.ts._linkedAccounts.unlinkConfirmTitle,
		text: i18n.ts._linkedAccounts.unlinkConfirmText,
		type: 'password',
		autocomplete: 'new-password',
		placeholder: i18n.ts._linkedAccounts.newPasswordForUnlink,
	});
	if (canceled || newPassword == null || newPassword === '') return null;
	return newPassword;
}

async function unlinkSelf() {
	const newPassword = await promptNewPasswordForUnlink();
	if (newPassword == null) return;

	await os.apiWithDialog('i/linked-accounts/unlink', { newPassword });
	os.toast(i18n.ts._linkedAccounts.unlinked);
	fetchState();
}

async function unlinkSub(user: Misskey.entities.UserLite) {
	const newPassword = await promptNewPasswordForUnlink();
	if (newPassword == null) return;

	await os.apiWithDialog('i/linked-accounts/unlink', { userId: user.id, newPassword });
	os.toast(i18n.ts._linkedAccounts.unlinked);
	fetchState();
}

async function linkExisting() {
	await os.apiWithDialog('i/linked-accounts/link', {
		username: linkUsername.value,
		password: linkPassword.value,
	});
	linkUsername.value = '';
	linkPassword.value = '';
	os.toast(i18n.ts._linkedAccounts.linked);
	fetchState();
}

async function createSub() {
	await os.apiWithDialog('i/linked-accounts/create-sub', {
		username: newSubUsername.value,
	});
	newSubUsername.value = '';
	os.toast(i18n.ts._linkedAccounts.created);
	fetchState();
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._settings.linkedAccounts,
	icon: 'ti ti-users-group',
}));
</script>

<style lang="scss" module>
.userItem {
	display: flex;
	align-items: center;
	gap: 8px;
}

.userItemMainBody {
	flex: 1;
	min-width: 0;
}

.remove {
	padding: 8px;
}
</style>
