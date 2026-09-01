<template>
<div class="memory">
	<x-pie class="pie" :value="usage"/>
	<div>
		<p><fa icon="memory"/>Memory</p>
		<p>Total: {{ bytes(total, 1) }}</p>
		<p>Used: {{ bytes(used, 1) }}</p>
		<p>Free: {{ bytes(free, 1) }}</p>
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
	props: ['connection'],
	data() {
		return {
			usage: 0,
			total: 0,
			used: 0,
			free: 0
		};
	},
	mounted() {
		// Total from `server-info`, live usage from the stream: the stream stopped carrying the
		// total, so every percentage here divided by `undefined`.
		this.$root.api('server-info').then(info => {
			this.total = info.mem?.total ?? 0;
		}).catch(() => undefined);

		this.connection.on('stats', this.onStats);
	},
	beforeUnmount() {
		this.connection.off('stats', this.onStats);
	},
	methods: {
		onStats(stats) {
			if (stats.mem == null) return;
			this.used = stats.mem.active ?? stats.mem.used ?? 0;
			if (this.total === 0) return;
			this.free = this.total - this.used;
			this.usage = this.used / this.total;
		}
	}
});
</script>

<style lang="stylus" scoped>
.memory
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
