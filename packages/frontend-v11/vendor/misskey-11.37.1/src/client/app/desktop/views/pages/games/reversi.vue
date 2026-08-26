<template>
<component :is="ui ? 'mk-ui' : 'div'">
	<x-reversi :game-id="$route.params.game" @nav="nav" :self-nav="false"/>
</component>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent } from 'vue';

export default defineComponent({
	components: {
		XReversi: defineAsyncComponent(() => import('../../../../common/views/components/games/reversi/reversi.vue').then(m => m.default))
	},
	props: {
		ui: {
			default: false
		}
	},
	methods: {
		nav(game, actualNav) {
			if (actualNav) {
				this.$router.push(`/games/reversi/${game.id}`);
			} else {
				// TODO: https://github.com/vuejs/vue-router/issues/703
				this.$router.push(`/games/reversi/${game.id}`);
			}
		}
	}
});
</script>
