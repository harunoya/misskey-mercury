<template>
<div class="hyhctythnmwihguaaapnbrbszsjqxpio">
	<p class="unsupported">The current backend exposes aggregate ActivityPub request charts, but not per-request AP logs.</p>
	<table>
		<thead>
			<tr>
				<th><fa :icon="faExchangeAlt"/> In/Out</th>
				<th><fa :icon="faBolt"/> Activity</th>
				<th><fa icon="server"/> Host</th>
				<th><fa icon="user"/> Actor</th>
			</tr>
		</thead>
		<tbody>
			<tr v-for="log in logs" :key="log.id">
				<td :class="log.direction">{{ log.direction == 'in' ? '<' : '>' }} {{ log.direction }}</td>
				<td>{{ log.activity }}</td>
				<td>{{ log.host }}</td>
				<td>@{{ log.actor }}</td>
			</tr>
		</tbody>
	</table>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { faBolt, faExchangeAlt } from '@fortawesome/free-solid-svg-icons';

export default defineComponent({
	data() {
		return {
			logs: [],
			connection: null,
			faBolt, faExchangeAlt
		};
	},

});
</script>

<style lang="stylus" scoped>
.hyhctythnmwihguaaapnbrbszsjqxpio
	display block
	padding 12px 16px 16px 16px
	height 250px
	overflow auto
	box-shadow 0 2px 4px rgba(0, 0, 0, 0.1)
	background var(--adminDashboardCardBg)
	border-radius 8px

	> .unsupported
		margin 0 0 12px
		color var(--adminDashboardCardFg)
		opacity 0.7

	> table
		width 100%
		max-width 100%
		overflow auto
		border-spacing 0
		border-collapse collapse
		color var(--adminDashboardCardFg)
		font-size 14px

		thead
			border-bottom solid 1px var(--adminDashboardCardDivider)

			tr
				th
					font-weight normal
					text-align left

		tbody
			tr
				&:nth-child(odd)
					background rgba(0, 0, 0, 0.025)

		th, td
			padding 8px 16px
			min-width 128px

		td.in
			color #d26755

		td.out
			color #55bb83

</style>
