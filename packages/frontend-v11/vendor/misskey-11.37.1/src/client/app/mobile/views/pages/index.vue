<template>
<component :is="$store.getters.isSignedIn ? 'home' : 'welcome'"></component>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import Home from './home.vue';
import Welcome from './welcome.vue';

export default defineComponent({
	components: {
		Home,
		Welcome
	}
});
</script>
