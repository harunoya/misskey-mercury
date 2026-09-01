<template>
<div class="mkw-hashtags">
	<ui-container :show-header="!props.compact">
		<template #header><fa icon="hashtag"/>{{ $t('title') }}</template>

		<div class="mkw-hashtags--body" :data-mobile="(platform == 'mobile') || null">
			<mk-trends/>
		</div>
	</ui-container>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import define from '../../../common/define-widget';
import i18n from '../../../i18n';

export default defineComponent({
	extends: define({
	name: 'hashtags',
	props: () => ({
		compact: false
	})
}),

	i18n: i18n('common/views/widgets/hashtags.vue'),
	methods: {
		func() {
			this.props.compact = !this.props.compact;
			this.save();
		}
	}
});
</script>
