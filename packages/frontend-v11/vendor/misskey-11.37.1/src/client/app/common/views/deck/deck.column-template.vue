<template>
<x-column>
	<template #header>
		<fa v-if="icon" :icon="icon"/>{{ title }}
	</template>

	<div>
		<component :is="resolvedComponent" @init="init" v-bind="$attrs"/>
	</div>
</x-column>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { asAsyncComponent } from '@compat/async-component';
import XColumn from './deck.column.vue';

export default defineComponent({
	components: {
		XColumn,
	},

	props: {
		component: {
			required: true
		}
	},

	computed: {
		// The route hands this down as a `() => import(...)` loader, which Vue 3 only
		// understands once wrapped as an async component.
		resolvedComponent() {
			return asAsyncComponent(this.component);
		},
	},

	data() {
		return {
			title: null,
			icon: null,
		};
	},

	mounted() {
	},

	methods: {
		init(v) {
			this.title = v.title;
			this.icon = v.icon;
		}
	}
});
</script>
