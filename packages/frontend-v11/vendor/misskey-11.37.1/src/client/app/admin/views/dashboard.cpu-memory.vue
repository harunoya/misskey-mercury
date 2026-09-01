<template>
<div class="zyknedwtlthezamcjlolyusmipqmjgxz">
	<div>
		<header>
			<span><fa icon="microchip"/> CPU <span>{{ cpuP }}%</span></span>
			<span v-if="serverInfo">{{ serverInfo.cpu.model }}</span>
		</header>
		<div ref="cpu"></div>
	</div>
	<div>
		<header>
			<span><fa icon="memory"/> MEM <span>{{ memP }}%</span></span>
			<span v-if="serverInfo"></span>
		</header>
		<div ref="mem"></div>
	</div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ApexCharts from 'apexcharts';

export default defineComponent({
	props: ['connection'],

	data() {
		return {
			stats: [],
			cpuChart: null,
			memChart: null,
			cpuP: '',
			memP: '',
			serverInfo: null
		};
	},

	watch: {
		stats(stats) {
			this.cpuChart.updateSeries([{
				data: stats.map((x, i) => ({ x: i, y: x.cpu_usage }))
			}]);
			this.memChart.updateSeries([{
				data: stats.map((x, i) => ({ x: i, y: this.memRatio(x) }))
			}]);
		}
	},

	mounted() {
		// `admin/server-info`, not `meta`: v11 read the CPU model off `meta.cpu`, and the current
		// backend moved the machine's hardware details to their own admin endpoint. `meta` has no
		// `cpu` any more, so reading it threw and took the whole dashboard down with it.
		this.$root.api('admin/server-info').then(info => {
			this.serverInfo = info;
		}).catch(() => {
			// The panel still draws its charts without the model name.
		});

		this.connection.on('stats', this.onStats);
		this.connection.on('statsLog', this.onStatsLog);
		this.connection.send('requestLog', {
			id: Math.random().toString().substr(2, 8),
			length: 200
		});

		const chartOpts = {
			chart: {
				type: 'area',
				height: 200,
				animations: {
					dynamicAnimation: {
						enabled: false
					}
				},
				toolbar: {
					show: false
				},
				zoom: {
					enabled: false
				}
			},
			dataLabels: {
				enabled: false
			},
			grid: {
				clipMarkers: false,
				borderColor: 'rgba(0, 0, 0, 0.1)'
			},
			stroke: {
				curve: 'straight',
				width: 2
			},
			tooltip: {
				enabled: false
			},
			series: [{
				data: []
			}],
			xaxis: {
				type: 'numeric',
				labels: {
					show: false
				},
				tooltip: {
					enabled: false
				}
			},
			yaxis: {
				show: false,
				min: 0,
				max: 1
			}
		};

		this.cpuChart = new ApexCharts(this.$refs.cpu, chartOpts);
		this.memChart = new ApexCharts(this.$refs.mem, chartOpts);

		this.cpuChart.render();
		this.memChart.render();
	},

	beforeUnmount() {
		this.connection.off('stats', this.onStats);
		this.connection.off('statsLog', this.onStatsLog);

		this.cpuChart.destroy();
		this.memChart.destroy();
	},

	methods: {
		/** `active` is what the current server reports; `used` is what v11's server sent. */
		memRatio(stats): number {
			const total = this.serverInfo?.mem?.total ?? 0;
			if (total === 0 || stats?.mem == null) return 0;
			return (stats.mem.active ?? stats.mem.used ?? 0) / total;
		},

		onStats(stats) {
			this.stats.push(stats);
			if (this.stats.length > 200) this.stats.shift();

			this.cpuP = (stats.cpu_usage * 100).toFixed(0);
			this.memP = (this.memRatio(stats) * 100).toFixed(0);
		},

		onStatsLog(statsLog) {
			for (const stats of statsLog.reverse()) {
				this.onStats(stats);
			}
		}
	}
});
</script>

<style lang="stylus" scoped>
.zyknedwtlthezamcjlolyusmipqmjgxz
	display flex

	> div
		display block
		flex 1
		padding 20px 12px 0 12px
		box-shadow 0 2px 4px rgba(0, 0, 0, 0.1)
		background var(--face)
		border-radius 8px

		&:first-child
			margin-right 16px

		> header
			display flex
			padding 0 8px
			margin-bottom -16px
			color var(--adminDashboardCardFg)
			font-size 14px

			> span
				&:last-child
					margin-left auto
					opacity 0.7

				> span
					opacity 0.7

		> div
			margin-bottom -10px

	@media (max-width 1000px)
		display block
		margin-bottom 26px

		> div
			&:first-child
				margin-right 0
				margin-bottom 26px

</style>
