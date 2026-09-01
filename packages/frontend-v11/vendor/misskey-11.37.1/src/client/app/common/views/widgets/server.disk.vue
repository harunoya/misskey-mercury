<template>
<div class="disk">
	<x-pie class="pie" :value="usage"/>
	<div>
		<p><fa :icon="['far', 'hdd']"/>Storage</p>
		<p>Total: {{ bytes(total, 1) }}</p>
		<p>Free: {{ bytes(available, 1) }}</p>
		<p>Used: {{ bytes(used, 1) }}</p>
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
			available: 0
		};
	},
	mounted() {
			// The stream carries only the live figures now; the machine's fixed capacities moved to
			// the `server-info` endpoint. v11 read `stats.disk`/`stats.mem.total` straight off the
			// stream, and `stats.disk` no longer exists at all — reading it threw on every stats
			// message the server sent.
		this.$root.api('server-info').then(info => {
			if (info.fs == null) return;
			this.total = info.fs.total;
			this.used = info.fs.used;
			this.available = info.fs.total - info.fs.used;
			this.usage = info.fs.total === 0 ? 0 : info.fs.used / info.fs.total;
		}).catch(() => {
			// Leaves the widget at zero rather than taking the column down with it.
		});
	}
});
</script>

<style lang="stylus" scoped>
.disk
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
