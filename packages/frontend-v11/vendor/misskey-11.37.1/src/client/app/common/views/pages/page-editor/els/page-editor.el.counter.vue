<template>
<x-container @remove="() => $emit('remove')" :draggable="true">
	<template #header><fa :icon="faBolt"/> {{ $t('blocks.counter') }}</template>

	<section style="padding: 0 16px 0 16px;">
		<ui-input :value="value.name" @input="value.name = $event"><template #prefix><fa :icon="faMagic"/></template><span>{{ $t('blocks._counter.name') }}</span></ui-input>
		<ui-input :value="value.text" @input="value.text = $event"><span>{{ $t('blocks._counter.text') }}</span></ui-input>
		<ui-input :value="value.inc" @input="value.inc = $event" type="number"><span>{{ $t('blocks._counter.inc') }}</span></ui-input>
	</section>
</x-container>
</template>

<script lang="ts">
import Vue, { defineComponent } from 'vue';
import { faBolt, faMagic } from '@fortawesome/free-solid-svg-icons';
import i18n from '../../../../../i18n';
import XContainer from '../page-editor.container.vue';

export default defineComponent({
	i18n: i18n('pages'),

	components: {
		XContainer
	},

	props: {
		value: {
			required: true
		},
	},

	data() {
		return {
			faBolt, faMagic
		};
	},

	created() {
		if (this.value.name == null) Vue.set(this.value, 'name', '');
	},
});
</script>
