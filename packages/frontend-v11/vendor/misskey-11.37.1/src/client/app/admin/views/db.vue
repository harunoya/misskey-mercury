<template>
<div>
	<ui-card>
		<template #title><fa :icon="faDatabase"/> {{ $t('tables') }}</template>
		<section v-if="tables">
			<div v-for="table in Object.keys(tables)" :key="table"><b>{{ table }}</b> {{ number(tables[table].count) }} {{ bytes(tables[table].size) }}</div>
		</section>
		<section>
			<header><fa :icon="faBroom"/> {{ $t('vacuum') }}</header>
			<ui-info>{{ $t('vacuum-info') }}</ui-info>
			<ui-info warn>The current backend intentionally has no REST endpoint for database maintenance. Run VACUUM through PostgreSQL operations.</ui-info>
			<ui-switch :value="fullVacuum" @change="fullVacuum = $event">FULL</ui-switch>
			<ui-switch :value="analyzeVacuum" @change="analyzeVacuum = $event">ANALYZE</ui-switch>
			<ui-button :disabled="true"><fa :icon="faBroom"/> {{ $t('vacuum') }}</ui-button>
			<ui-info warn>{{ $t('vacuum-exclamation') }}</ui-info>
		</section>
	</ui-card>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../i18n';
import { faDatabase, faBroom } from '@fortawesome/free-solid-svg-icons';

export default defineComponent({
	i18n: i18n('admin/views/db.vue'),

	data() {
		return {
			tables: null,
			fullVacuum: true,
			analyzeVacuum: true,
			faDatabase, faBroom
		};
	},

	mounted() {
		this.fetch();
	},

	methods: {
		fetch() {
			this.$root.api('admin/get-table-stats').then(tables => {
				this.tables = tables;
			});
		},

	}
});
</script>
