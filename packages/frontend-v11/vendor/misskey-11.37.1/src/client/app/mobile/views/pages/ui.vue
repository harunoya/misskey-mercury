<template>
<mk-ui>
	<template #header><span style="margin-right:4px;" v-if="icon"><fa :icon="icon"/></span>{{ title }}</template>

	<main>
		<component :is="resolvedComponent" @init="init" v-bind="$attrs"/>
	</main>
</mk-ui>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { asAsyncComponent } from '@compat/async-component';

export default defineComponent({
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
