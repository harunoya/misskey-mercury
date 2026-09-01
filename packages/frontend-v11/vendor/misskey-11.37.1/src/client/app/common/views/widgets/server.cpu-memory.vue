<template>
<div class="cpu-memory">
	<svg :viewBox="`0 0 ${ viewBoxX } ${ viewBoxY }`">
		<defs>
			<linearGradient :id="cpuGradientId" x1="0" x2="0" y1="1" y2="0">
				<stop offset="0%" stop-color="hsl(180, 80%, 70%)"></stop>
				<stop offset="100%" stop-color="hsl(0, 80%, 70%)"></stop>
			</linearGradient>
			<mask :id="cpuMaskId" x="0" y="0" :width="viewBoxX" :height="viewBoxY">
				<polygon
					:points="cpuPolygonPoints"
					fill="#fff"
					fill-opacity="0.5"/>
				<polyline
					:points="cpuPolylinePoints"
					fill="none"
					stroke="#fff"
					stroke-width="1"/>
				<circle
					:cx="cpuHeadX"
					:cy="cpuHeadY"
					r="1.5"
					fill="#fff"/>
			</mask>
		</defs>
		<rect
			x="-2" y="-2"
			:width="viewBoxX + 4" :height="viewBoxY + 4"
			:style="`stroke: none; fill: url(#${ cpuGradientId }); mask: url(#${ cpuMaskId })`"/>
		<text x="1" y="5">CPU <tspan>{{ cpuP }}%</tspan></text>
	</svg>
	<svg :viewBox="`0 0 ${ viewBoxX } ${ viewBoxY }`">
		<defs>
			<linearGradient :id="memGradientId" x1="0" x2="0" y1="1" y2="0">
				<stop offset="0%" stop-color="hsl(180, 80%, 70%)"></stop>
				<stop offset="100%" stop-color="hsl(0, 80%, 70%)"></stop>
			</linearGradient>
			<mask :id="memMaskId" x="0" y="0" :width="viewBoxX" :height="viewBoxY">
				<polygon
					:points="memPolygonPoints"
					fill="#fff"
					fill-opacity="0.5"/>
				<polyline
					:points="memPolylinePoints"
					fill="none"
					stroke="#fff"
					stroke-width="1"/>
				<circle
					:cx="memHeadX"
					:cy="memHeadY"
					r="1.5"
					fill="#fff"/>
			</mask>
		</defs>
		<rect
			x="-2" y="-2"
			:width="viewBoxX + 4" :height="viewBoxY + 4"
			:style="`stroke: none; fill: url(#${ memGradientId }); mask: url(#${ memMaskId })`"/>
		<text x="1" y="5">MEM <tspan>{{ memP }}%</tspan></text>
	</svg>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { v4 as uuid } from 'uuid';

export default defineComponent({
	props: ['connection'],
	data() {
		return {
			memTotal: 0,
			viewBoxX: 50,
			viewBoxY: 30,
			stats: [],
			cpuGradientId: uuid(),
			cpuMaskId: uuid(),
			memGradientId: uuid(),
			memMaskId: uuid(),
			cpuPolylinePoints: '',
			memPolylinePoints: '',
			cpuPolygonPoints: '',
			memPolygonPoints: '',
			cpuHeadX: null,
			cpuHeadY: null,
			memHeadX: null,
			memHeadY: null,
			cpuP: '',
			memP: ''
		};
	},
	mounted() {
		// The stream stopped carrying the machine's total memory; it lives on `server-info` now.
		this.$root.api('server-info').then(info => {
			this.memTotal = info.mem?.total ?? 0;
		}).catch(() => undefined);

		this.connection.on('stats', this.onStats);
		this.connection.on('statsLog', this.onStatsLog);
		this.connection.send('requestLog', {
			id: Math.random().toString().substr(2, 8)
		});
	},
	beforeUnmount() {
		this.connection.off('stats', this.onStats);
		this.connection.off('statsLog', this.onStatsLog);
	},
	methods: {
		/** `active` is what the current server reports; `used` is what v11's server sent. */
		memRatio(stats): number {
			if (this.memTotal === 0 || stats?.mem == null) return 0;
			return (stats.mem.active ?? stats.mem.used ?? 0) / this.memTotal;
		},

		onStats(stats) {
			this.stats.push(stats);
			if (this.stats.length > 50) this.stats.shift();

			const cpuPolylinePoints = this.stats.map((s, i) => [this.viewBoxX - ((this.stats.length - 1) - i), (1 - s.cpu_usage) * this.viewBoxY]);
			const memPolylinePoints = this.stats.map((s, i) => [this.viewBoxX - ((this.stats.length - 1) - i), (1 - (this.memRatio(s))) * this.viewBoxY]);
			this.cpuPolylinePoints = cpuPolylinePoints.map(xy => `${xy[0]},${xy[1]}`).join(' ');
			this.memPolylinePoints = memPolylinePoints.map(xy => `${xy[0]},${xy[1]}`).join(' ');

			this.cpuPolygonPoints = `${this.viewBoxX - (this.stats.length - 1)},${this.viewBoxY} ${this.cpuPolylinePoints} ${this.viewBoxX},${this.viewBoxY}`;
			this.memPolygonPoints = `${this.viewBoxX - (this.stats.length - 1)},${this.viewBoxY} ${this.memPolylinePoints} ${this.viewBoxX},${this.viewBoxY}`;

			this.cpuHeadX = cpuPolylinePoints[cpuPolylinePoints.length - 1][0];
			this.cpuHeadY = cpuPolylinePoints[cpuPolylinePoints.length - 1][1];
			this.memHeadX = memPolylinePoints[memPolylinePoints.length - 1][0];
			this.memHeadY = memPolylinePoints[memPolylinePoints.length - 1][1];

			this.cpuP = (stats.cpu_usage * 100).toFixed(0);
			this.memP = (this.memRatio(stats) * 100).toFixed(0);
		},
		onStatsLog(statsLog) {
			for (const stats of statsLog.reverse()) this.onStats(stats);
		}
	}
});
</script>

<style lang="stylus" scoped>
.cpu-memory
	> svg
		display block
		padding 10px
		width 50%
		float left

		&:first-child
			padding-right 5px

		&:last-child
			padding-left 5px

		> text
			font-size 5px
			fill var(--chartCaption)

			> tspan
				opacity 0.5

	&:after
		content ""
		display block
		clear both

</style>
