<template>
<div class="fdcvngpy">
	<sequential-entrance animation="entranceFromTop" delay="25">
		<template v-for="note in notes" :key="note.id">
			<mk-note-detail class="post" :note="note"/>
		</template>
	</sequential-entrance>
	<ui-button v-if="more" @click="fetchMore()">{{ $t('@.load-more') }}</ui-button>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../i18n';
import paging from '../../../common/scripts/paging';

export default defineComponent({
	i18n: i18n(),

	mixins: [
		paging({
			captureWindowScroll: true,
		}),
	],

	props: {
		pagination: {
			required: true
		},
		extract: {
			required: false
		}
	},

	computed: {
		notes() {
			return this.extract ? this.extract(this.items) : this.items;
		}
	}
});
</script>

<style lang="stylus" scoped>
.fdcvngpy
	> * > .post
		margin-bottom 8px

	@media (min-width 500px)
		> * > .post
			margin-bottom 16px

</style>
