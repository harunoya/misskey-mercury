/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cloneVNode, defineComponent, Fragment, h } from 'vue';
import type { App, DirectiveBinding, Plugin, VNode } from 'vue';

/**
 * Stand-ins for the Vue 2 plugins v11 used that were never ported to Vue 3.
 *
 * Each is deliberately small: the point is to keep the call sites in the vendored client working
 * unchanged, not to reproduce the original libraries. Where a feature cannot be reproduced honestly
 * it degrades to nothing visible rather than to something that looks broken.
 */

/**
 * `v-animate-css` ran an Animate.css class on an element. Animate.css is not bundled, so the
 * directive only toggles the class and lets the stylesheet decide whether anything happens.
 */
export const vAnimateCss: Plugin = {
	install(app: App) {
		app.directive('animate-css', {
			mounted(el: HTMLElement, binding: DirectiveBinding) {
				const name = typeof binding.value === 'string' ? binding.value : binding.value?.classes;
				if (!name) return;
				el.classList.add('animated', name);
			},
		});
	},
};

/**
 * `v-debounce` delayed a v-model write. v11 uses it on one search field; a plain input listener
 * with a timer is the whole feature.
 */
export const vDebounce: Plugin = {
	install(app: App) {
		app.directive('debounce', {
			mounted(el: HTMLInputElement, binding: DirectiveBinding) {
				const delay = Number(binding.value) || 300;
				let timer: number | undefined;
				el.addEventListener('input', () => {
					window.clearTimeout(timer);
					timer = window.setTimeout(() => {
						el.dispatchEvent(new CustomEvent('debounced', { detail: el.value }));
					}, delay);
				});
			},
		});
	},
};

/**
 * `vue-sequential-entrance`, reimplemented for Vue 3.
 *
 * v11 wraps eleven lists in `<sequential-entrance animation="entranceFromTop" delay="25">`, which
 * fades each child in one after another. The original is a Vue 2 functional component that mutates
 * its children's vnode data; Vue 3 vnodes are immutable, so the same effect comes from cloning each
 * child with the class and the staggered `animation-delay`. The defaults, the wrapper tag and the
 * inline styles are the upstream ones — v11's own `animation.styl` supplies the keyframes.
 */
const SequentialEntranceComponent = defineComponent({
	name: 'SequentialEntrance',
	props: {
		delay: { type: [Number, String], default: 250 },
		tag: { type: String, default: 'span' },
		animation: { type: String, default: 'entranceFromRight' },
		fromTop: { type: null, default: undefined },
		fromRight: { type: null, default: undefined },
		fromBottom: { type: null, default: undefined },
		fromLeft: { type: null, default: undefined },
	},
	setup(props, { slots }) {
		return () => {
			let animation = props.animation;
			if (props.fromTop !== undefined) animation = 'entranceFromTop';
			if (props.fromRight !== undefined) animation = 'entranceFromRight';
			if (props.fromBottom !== undefined) animation = 'entranceFromBottom';
			if (props.fromLeft !== undefined) animation = 'entranceFromLeft';

			const delay = Number(props.delay) || 0;

			// A `v-for` arrives as a single fragment in Vue 3, where Vue 2 handed over a flat list;
			// flattening keeps the stagger counting real children rather than one wrapper.
			const flatten = (nodes: VNode[]): VNode[] => nodes.flatMap(node =>
				node.type === Fragment && Array.isArray(node.children)
					? flatten(node.children as VNode[])
					: [node]);

			const children = flatten(slots.default?.() ?? []).map((child, index) => cloneVNode(child, {
				class: animation,
				style: {
					opacity: 0,
					animationFillMode: 'forwards',
					animationDelay: `${index * delay}ms`,
				},
			}));

			return h(props.tag, children);
		};
	},
});

export const sequentialEntrance: Plugin = {
	install(app: App) {
		app.component('sequential-entrance', SequentialEntranceComponent);
	},
};

/**
 * `vue-js-modal` provided `this.$modal`. v11 registers it but drives its own dialog components, so
 * the surface only has to exist.
 */
export const vModal: Plugin = {
	install(app: App) {
		app.config.globalProperties.$modal = {
			show: () => undefined,
			hide: () => undefined,
		};
	},
};
