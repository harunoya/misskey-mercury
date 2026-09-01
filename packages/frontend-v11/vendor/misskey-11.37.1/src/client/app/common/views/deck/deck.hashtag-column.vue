<template>
<x-column>
	<template #header>
		<fa icon="hashtag"/><span>{{ tag }}</span>
	</template>

	<div class="xroyrflcmhhtmlwmyiwpfqiirqokfueb">
		<div ref="chart" class="chart unavailable">The current backend does not retain per-hashtag chart data.</div>
		<x-hashtag-tl :tag-tl="tagTl" class="tl" :key="JSON.stringify(tagTl)"/>
	</div>
</x-column>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import XColumn from './deck.column.vue';
import XHashtagTl from './deck.hashtag-tl.vue';

export default defineComponent({
	components: {
		XColumn,
		XHashtagTl
	},

	computed: {
		tag(): string {
			return this.$route.params.tag;
		},

		tagTl(): any {
			return {
				query: [[this.tag]]
			};
		}
	}
});
</script>

<style lang="stylus" scoped>
.xroyrflcmhhtmlwmyiwpfqiirqokfueb
	background var(--deckColumnBg)

	> .chart
		margin-bottom 16px
		background var(--face)

		&.unavailable
			box-sizing border-box
			min-height 70px
			padding 20px 16px
			color var(--text)
			opacity 0.7

	> .tl
		background var(--face)

</style>
