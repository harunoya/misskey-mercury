<template>
<div class="cpu">
	<x-pie class="pie" :value="usage"/>
	<div>
		<p><fa icon="microchip"/>CPU</p>
		<!-- API_COMPAT: v11's `meta` reported the host's CPU; the current one does not, so these
		     read as blank rather than taking the whole widget down with them. -->
		<p v-if="meta.cpu">{{ meta.cpu.cores }} Logical cores</p>
		<p v-if="meta.cpu">{{ meta.cpu.model }}</p>
	</div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import XPie from './server.pie.vue';

export default defineComponent({
	components: {
		XPie
	},
	props: ['connection', 'meta'],
	data() {
		return {
			usage: 0
		};
	},
	mounted() {
		this.connection.on('stats', this.onStats);
	},
	beforeUnmount() {
		this.connection.off('stats', this.onStats);
	},
	methods: {
		onStats(stats) {
			this.usage = stats.cpu_usage;
		}
	}
});
</script>

<style lang="stylus" scoped>
.cpu
	> .pie
		padding 10px
		height 100px
		float left

	> div
		float left
		width calc(100% - 100px)
		padding 10px 10px 10px 0

		> p
			margin 0
			font-size 12px
			color var(--chartCaption)

			&:first-child
				font-weight bold

				> [data-icon]
					margin-right 4px

	&:after
		content ""
		display block
		clear both

</style>
