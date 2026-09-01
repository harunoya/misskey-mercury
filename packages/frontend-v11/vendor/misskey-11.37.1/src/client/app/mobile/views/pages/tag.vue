<template>
<mk-ui>
	<template #header><span style="margin-right:4px;"><fa icon="hashtag"/></span>{{ $route.params.tag }}</template>

	<main>
		<mk-notes ref="timeline" :pagination="pagination" @inited="inited"/>
	</main>
</mk-ui>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../i18n';
import Progress from '../../../common/scripts/loading';

export default defineComponent({
	i18n: i18n('mobile/views/pages/tag.vue'),
	data() {
		return {
			pagination: {
				endpoint: 'notes/search-by-tag',
				limit: 20,
				params: {
					tag: this.$route.params.tag
				}
			}
		};
	},
	watch: {
		$route() {
			this.$refs.timeline.reload();
		}
	},
	methods: {
		inited() {
			Progress.done();
		},
	}
});
</script>
