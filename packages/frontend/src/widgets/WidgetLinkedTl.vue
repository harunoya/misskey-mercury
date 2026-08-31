<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" class="mkw-linkedTl">
	<template #icon><i class="ti ti-user-scan"></i></template>
	<template #header>{{ selected ? selected.username : i18n.ts._widgets.linkedTl }}</template>
	<template #func="{ buttonStyleClass }"><button class="_button" :class="buttonStyleClass" @click="configure()"><i class="ti ti-settings"></i></button></template>

	<div :class="$style.root">
		<div v-if="selected == null" :class="$style.info">
			<p>{{ i18n.ts._linkedTl.noAccount }}</p>
			<MkButton primary style="margin: 0 auto;" @click="openAccountPicker">{{ i18n.ts._linkedTl.selectAccount }}</MkButton>
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
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { onMounted, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkNote from '@/components/MkNote.vue';
import { i18n } from '@/i18n.js';
import { useLinkedTimeline } from '@/composables/use-linked-timeline.js';

const name = 'linkedTl';

const widgetPropsDef = {
	showHeader: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
	linkedHost: {
		type: 'string',
		default: null as string | null,
		hidden: true,
	},
	linkedUserId: {
		type: 'string',
		default: null as string | null,
		hidden: true,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const { fetching, tokenRevoked, notes, selected, refresh, openAccountPicker } = useLinkedTimeline(
	() => ({ host: widgetProps.linkedHost, userId: widgetProps.linkedUserId }),
	(host, userId) => {
		widgetProps.linkedHost = host;
		widgetProps.linkedUserId = userId;
		save();
	},
);

watch(() => [widgetProps.linkedHost, widgetProps.linkedUserId], () => {
	refresh();
});

onMounted(() => {
	refresh();
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
}

.info {
	padding: 16px;
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
	padding: 16px;
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}
</style>
