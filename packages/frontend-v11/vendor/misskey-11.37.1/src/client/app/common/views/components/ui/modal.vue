<template>
<div class="modal">
	<div class="bg" ref="bg" @click="onBgClick" />
	<!-- The class on this slot did nothing: Vue 3 does not forward attributes from `<slot>` onto the
	     content, so the `.main` rule below is written to reach that content instead. -->
	<slot />
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import anime from 'animejs';

export default defineComponent({
	props: {
		closeOnBgClick: {
			type: Boolean,
			required: false,
			default: true
		},
		openAnimeDuration: {
			type: Number,
			required: false,
			default: 100
		},
		closeAnimeDuration: {
			type: Number,
			required: false,
			default: 100
		}
	},
	mounted() {
		anime({
			targets: this.$refs.bg,
			opacity: 1,
			duration: this.openAnimeDuration,
			easing: 'linear'
		});
	},
	methods: {
		onBgClick() {
			this.$emit('bg-click');
			if (this.closeOnBgClick) this.close();
		},
		close() {
			this.$emit('before-close');

			anime({
				targets: this.$refs.bg,
				opacity: 0,
				duration: this.closeAnimeDuration,
				easing: 'linear',
				complete: () => (this as any).destroyDom()
			});
		}
	}
});
</script>

<style lang="stylus" scoped>
.modal
	position fixed
	z-index 2048
	top 0
	left 0
	width 100%
	height 100%

.bg
	display block
	position fixed
	z-index 1
	top 0
	left 0
	width 100%
	height 100%
	background rgba(#000, 0.7)
	opacity 0

// Reaches the slotted content, which is what `.main` actually is.
//
// In Vue 2 this was `<slot class="main"/>` plus a scoped `.main` rule: the class was merged onto the
// slot content and the scoped rule matched it. Vue 3 does neither, so the dialog sat at `z-index:
// auto` while the backdrop above claimed every click — every dialog in v11 rendered, and none of
// their buttons could be pressed.
.modal
	>>> .main
		z-index 2
</style>
