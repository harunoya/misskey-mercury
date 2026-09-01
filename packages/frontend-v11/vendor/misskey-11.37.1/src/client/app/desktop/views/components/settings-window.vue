<template>
<mk-window ref="window" is-modal width="700px" height="550px" @closed="destroyDom">
	<template #header :class="$style.header"><fa icon="cog"/>{{ $t('@.settings') }}</template>
	<x-settings :initial-page="initialPage" @done="close"/>
</mk-window>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent } from 'vue';
import i18n from '../../../i18n';

export default defineComponent({
	i18n: i18n('desktop/views/components/settings-window.vue'),

	components: {
		XSettings: defineAsyncComponent(() => import('./settings.vue').then(m => m.default))
	},

	props: {
		initialPage: {
			type: String,
			required: false
		}
	},
	methods: {
		close() {
			(this as any).$refs.window.close();
		}
	}
});
</script>

<style lang="stylus" module>
.header
	> [data-icon]
		margin-right 4px

</style>
