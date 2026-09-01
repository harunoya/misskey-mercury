<template>
<div class="rdfaahpb" v-hotkey.global="keymap">
	<div class="backdrop" ref="backdrop" @click="close"></div>
	<div class="popover" :class="{ isMobile: $root.isMobile }" ref="popover">
		<x-emoji-picker :pinned="rs" @chosen="react"/>
	</div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../i18n';
import anime from 'animejs';
import XEmojiPicker from './emoji-picker.vue';

/**
 * The reaction picker.
 *
 * v11 offered the account's ten configured reactions and a text field to type anything else into.
 * Everything the instance actually had was therefore invisible: reacting with a custom emoji meant
 * knowing its name and spelling it. This keeps the popover, its placement and its `chosen` contract,
 * and puts the full emoji picker inside it — the configured reactions stay one click away as the
 * picker's pinned row.
 */
export default defineComponent({
	i18n: i18n('common/views/components/reaction-picker.vue'),

	components: {
		XEmojiPicker,
	},

	props: {
		source: {
			required: true
		},

		reactions: {
			required: false
		},

		showFocus: {
			type: Boolean,
			required: false,
			default: false
		},

		animation: {
			type: Boolean,
			required: false,
			default: true
		}
	},

	data() {
		return {
			rs: this.reactions || this.$store.state.settings.reactions,
		};
	},

	computed: {
		keymap(): any {
			return {
				'esc': this.close,
			};
		}
	},

	mounted() {
		this.$nextTick(() => {
			const popover = this.$refs.popover as any;

			const rect = this.source.getBoundingClientRect();
			const width = popover.offsetWidth;
			const height = popover.offsetHeight;

			if (this.$root.isMobile) {
				const x = rect.left + window.pageXOffset + (this.source.offsetWidth / 2);
				const y = rect.top + window.pageYOffset + (this.source.offsetHeight / 2);
				popover.style.left = (x - (width / 2)) + 'px';
				popover.style.top = (y - (height / 2)) + 'px';
			} else {
				const x = rect.left + window.pageXOffset + (this.source.offsetWidth / 2);
				const y = rect.top + window.pageYOffset + this.source.offsetHeight;
				// Kept on screen: the picker is much taller than the ten buttons it replaced, so
				// anchoring it below a note near the bottom would otherwise run off the viewport.
				const maxLeft = window.pageXOffset + document.documentElement.clientWidth - width - 8;
				const minLeft = window.pageXOffset + 8;
				const flipUp = (rect.top + this.source.offsetHeight + height) > document.documentElement.clientHeight
					&& rect.top > height;
				popover.style.left = Math.max(minLeft, Math.min(x - (width / 2), maxLeft)) + 'px';
				popover.style.top = (flipUp ? rect.top + window.pageYOffset - height : y) + 'px';
				if (flipUp) popover.classList.add('flipped');
			}

			anime({
				targets: this.$refs.backdrop,
				opacity: 1,
				duration: this.animation ? 100 : 0,
				easing: 'linear'
			});

			anime({
				targets: this.$refs.popover,
				opacity: 1,
				scale: [0.5, 1],
				duration: this.animation ? 500 : 0
			});
		});
	},

	methods: {
		react(reaction) {
			this.$emit('chosen', reaction);
		},

		close() {
			(this.$refs.backdrop as any).style.pointerEvents = 'none';
			anime({
				targets: this.$refs.backdrop,
				opacity: 0,
				duration: this.animation ? 200 : 0,
				easing: 'linear'
			});

			(this.$refs.popover as any).style.pointerEvents = 'none';
			anime({
				targets: this.$refs.popover,
				opacity: 0,
				scale: 0.5,
				duration: this.animation ? 200 : 0,
				easing: 'easeInBack',
				complete: () => {
					this.$emit('closed');
					this.destroyDom();
				}
			});
		},
	}
});
</script>

<style lang="stylus" scoped>
.rdfaahpb
	position initial

	> .backdrop
		position fixed
		top 0
		left 0
		z-index 10000
		width 100%
		height 100%
		background var(--modalBackdrop)
		opacity 0

	> .popover
		$bgcolor = var(--popupBg)
		position absolute
		z-index 10001
		background $bgcolor
		border-radius 4px
		box-shadow 0 3px 12px rgba(27, 31, 35, 0.15)
		transform scale(0.5)
		opacity 0

		&.isMobile
			> div
				width 280px

				> button
					width 50px
					height 50px
					font-size 28px
					border-radius 4px

		&:not(.isMobile)
			$arrow-size = 16px

			margin-top $arrow-size
			transform-origin center -($arrow-size)

			&:before
				content ""
				display block
				position absolute
				top -($arrow-size * 2)
				left s('calc(50% - %s)', $arrow-size)
				border-top solid $arrow-size transparent
				border-left solid $arrow-size transparent
				border-right solid $arrow-size transparent
				border-bottom solid $arrow-size $bgcolor

		// Opened upwards because there was no room below: the arrow has to move with it, and the
		// margin that made space for it belongs on the other side.
		&.flipped
			margin-top 0
			margin-bottom 16px
			transform-origin center calc(100% + 16px)

			&:before
				top auto
				bottom -32px
				border-bottom-width 0
				border-top solid 16px $bgcolor

		> p
			display block
			margin 0
			padding 8px 10px
			font-size 14px
			color var(--popupFg)
			border-bottom solid var(--lineWidth) var(--faceDivider)
			line-height 20px

		> .buttons
			padding 4px 4px 8px 4px
			width 216px
			text-align center

			&.showFocus
				> button:focus
					z-index 1

					&:after
						content ""
						pointer-events none
						position absolute
						top 0
						right 0
						bottom 0
						left 0
						border 2px solid var(--primaryAlpha03)
						border-radius 4px

			> button
				padding 0
				width 40px
				height 40px
				font-size 24px
				border-radius 2px

				> *
					height 1em

				&:hover
					background var(--reactionPickerButtonHoverBg)

				&:active
					background var(--primary)
					box-shadow inset 0 0.15em 0.3em rgba(27, 31, 35, 0.15)

		> .text
			width 216px
			padding 0 8px 8px 8px

			> input
				width 100%
				padding 10px
				margin 0
				text-align center
				font-size 16px
				color var(--desktopPostFormTextareaFg)
				background var(--desktopPostFormTextareaBg)
				outline none
				border solid 1px var(--primaryAlpha01)
				border-radius 4px
				transition border-color .2s ease

				&:hover
					border-color var(--primaryAlpha02)
					transition border-color .1s ease

				&:focus
					border-color var(--primaryAlpha05)
					transition border-color 0s ease

</style>
