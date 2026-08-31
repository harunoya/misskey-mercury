<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="async () => { await refresh() }">
	<template #header>
		<i class="ti ti-user-scan"></i>
		<span style="margin-left: 8px;">{{ column.name || (selected ? selected.username : i18n.ts._deck._columns.linkedTl) }}</span>
	</template>

	<div v-if="selected == null" :class="$style.info">
		<p>{{ i18n.ts._linkedTl.noAccount }}</p>
		<MkButton style="margin: 0 auto;" @click="openAccountPicker">{{ i18n.ts._linkedTl.selectAccount }}</MkButton>
	</div>

	<div v-else-if="tokenRevoked" :class="$style.info">
		<p>{{ i18n.ts._linkedTl.tokenRevoked }}</p>
	</div>

	<div v-else>
		<MkInfo :class="$style.readOnlyNotice">{{ i18n.ts._linkedTl.readOnlyNotice }}</MkInfo>

		<MkLoading v-if="fetching"/>
		<MkResult v-else-if="notes.length === 0" type="empty" :text="i18n.ts.noNotes"/>
		<div v-else :class="$style.notes">
			<MkNote v-for="note in notes" :key="note.id" :note="note" :mock="true" :class="$style.note"/>
		</div>
	</div>
</XColumn>
</template>

<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue';
import XColumn from './column.vue';
import type { Column } from '@/deck.js';
import type { MenuItem } from '@/types/menu.js';
import { updateColumn } from '@/deck.js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNote from '@/components/MkNote.vue';
import { i18n } from '@/i18n.js';
import { useLinkedTimeline } from '@/composables/use-linked-timeline.js';

const props = defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const { fetching, tokenRevoked, notes, selected, refresh, openAccountPicker, switchToThisAccount } = useLinkedTimeline(
	() => ({ host: props.column.linkedHost, userId: props.column.linkedUserId }),
	(host, userId) => updateColumn(props.column.id, { linkedHost: host, linkedUserId: userId }),
);

const menu = computed<MenuItem[]>(() => {
	const items: MenuItem[] = [{
		text: i18n.ts._linkedTl.selectAccount,
		icon: 'ti ti-user-scan',
		action: openAccountPicker,
	}];
	if (selected.value != null) {
		items.push({
			text: i18n.ts._linkedTl.switchToThisAccount,
			icon: 'ti ti-switch-horizontal',
			action: switchToThisAccount,
		});
	}
	return items;
});

watch(() => [props.column.linkedHost, props.column.linkedUserId], () => {
	refresh();
});

onMounted(() => {
	refresh();
});
</script>

<style lang="scss" module>
.info {
	padding: 32px 16px;
	text-align: center;

	> p {
		margin: 0 0 12px 0;
		opacity: 0.7;
	}
}

.readOnlyNotice {
	margin: 8px;
}

.notes {
	display: flex;
	flex-direction: column;
}

.note {
	padding: 16px 0;
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}
</style>
