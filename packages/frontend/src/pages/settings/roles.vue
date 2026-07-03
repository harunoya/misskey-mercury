<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/roles" :label="i18n.ts.roles" :keywords="['role', 'badge']" icon="ti ti-badges">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/client-assets/label_3d.png" color="#ffbf00">
			<SearchText>{{ i18n.ts._roleDisplay.description }}</SearchText>
		</MkFeatureBanner>
		<SearchMarker :keywords="['roles']">
			<div class="_gaps_s">
				<MkResult v-if="roleDisplayRoles.length === 0" type="empty"/>
				<div v-for="role in roleDisplayRoles" :key="role.id" class="_panel _gaps_s" :class="$style.roleItem">
					<MkRolePreview :role="role" :forModeration="false"/>
					<MkSwitch
						:modelValue="isRoleDisplayShown(role)"
						:disabled="role.isPublicDisplayRequired"
						@update:modelValue="value => updateRoleDisplay(role, value)"
					>
						<template #label>{{ i18n.ts._roleDisplay.displayToggle }}</template>
						<template v-if="role.isPublicDisplayRequired" #caption>{{ i18n.ts._roleDisplay.alwaysShownByAdmin }}</template>
					</MkSwitch>
				</div>
			</div>
		</SearchMarker>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type * as Misskey from 'misskey-js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import MkRolePreview from '@/components/MkRolePreview.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { definePage } from '@/page.js';
import { updateCurrentAccount } from '@/accounts.js';

const $i = ensureSignin();

const hiddenRoleIds = ref([...getHiddenRoleIds($i)]);
const roleDisplayRoles = computed(() => $i.roles);

function getHiddenRoleIds(user: { hiddenRoleIds?: string[] }): string[] {
	return user.hiddenRoleIds ?? [];
}

function isRoleDisplayShown(role: Misskey.entities.RoleLite): boolean {
	return role.isPublicDisplayRequired === true || !hiddenRoleIds.value.includes(role.id);
}

async function updateRoleDisplay(role: Misskey.entities.RoleLite, visible: boolean) {
	if (role.isPublicDisplayRequired === true) return;

	const nextHiddenRoleIds = new Set(hiddenRoleIds.value);
	if (visible) {
		nextHiddenRoleIds.delete(role.id);
	} else {
		nextHiddenRoleIds.add(role.id);
	}

	const nextIds = roleDisplayRoles.value
		.filter(role => role.isPublicDisplayRequired !== true && nextHiddenRoleIds.has(role.id))
		.map(role => role.id);

	const updated = await misskeyApi('i/update', {
		hiddenRoleIds: nextIds,
	});

	updateCurrentAccount(updated);
	hiddenRoleIds.value = [...getHiddenRoleIds(updated)];
}

definePage(() => ({
	title: i18n.ts.roles,
	icon: 'ti ti-badges',
}));
</script>

<style lang="scss" module>
.roleItem {
	padding: 16px;
}
</style>
