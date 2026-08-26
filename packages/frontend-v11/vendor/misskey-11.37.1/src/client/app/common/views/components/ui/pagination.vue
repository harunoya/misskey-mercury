<template>
<div class="mwermpua" v-if="!fetching">
	<sequential-entrance animation="entranceFromTop" delay="25">
		<slot :items="items"></slot>
	</sequential-entrance>
	<div class="more" v-if="more">
		<ui-button @click="fetchMore()">{{ $t('@.load-more') }}</ui-button>
	</div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import paging from '../../../scripts/paging';

export default defineComponent({
	mixins: [
		paging({
			captureWindowScroll: false,
		}),
	],

	props: {
		pagination: {
			required: true
		},
	},
});
</script>

<style lang="stylus" scoped>
.mwermpua
	> .more
		margin-top 16px

</style>
