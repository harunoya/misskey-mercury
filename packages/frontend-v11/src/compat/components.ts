/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineComponent, h } from 'vue';
import Prism from 'prismjs';

/**
 * Replacements for the Vue 2 component libraries v11 imported that have no Vue 3 release.
 *
 * They keep the props and slots of the originals so the vendored call sites stay as they are.
 */

/**
 * `vue-prism-component`. The original wrapped Prism's highlighter in a `<pre><code>` pair and
 * re-highlighted whenever the slot changed; that is the entire component.
 */
export const XPrism = defineComponent({
	name: 'XPrism',
	props: {
		language: { type: String, default: 'markup' },
		inline: { type: Boolean, default: false },
		code: { type: String, default: null },
	},
	computed: {
		source(): string {
			if (this.code != null) return this.code;
			const slot = this.$slots.default?.();
			return slot?.map(node => (typeof node.children === 'string' ? node.children : '')).join('') ?? '';
		},
		highlighted(): string {
			const grammar = Prism.languages[this.language] ?? Prism.languages.markup;
			try {
				return Prism.highlight(this.source, grammar, this.language);
			} catch {
				// An unknown language should show the code, not blow up the note that contains it.
				return this.source;
			}
		},
	},
	render() {
		const code = h('code', {
			class: `language-${this.language}`,
			innerHTML: this.highlighted,
		});
		return this.inline ? code : h('pre', { class: `language-${this.language}` }, [code]);
	},
});

/**
 * `vue-content-loading`. The original rendered its slot — a set of SVG shapes — inside an animated
 * gradient mask. The shapes come from the caller, so only the wrapper and the shimmer are needed.
 */
export const VueContentLoading = defineComponent({
	name: 'VueContentLoading',
	props: {
		width: { type: Number, default: 400 },
		height: { type: Number, default: 130 },
		primary: { type: String, default: '#f0f0f0' },
		secondary: { type: String, default: '#e0e0e0' },
	},
	data() {
		return { gradientId: Math.random().toString(36).slice(2) };
	},
	render() {
		// `_uid` was Vue 2's per-instance counter, and Vue 3 has no equivalent on the instance.
		// The gradient only needs an id no other instance shares.
		const id = `vcl-${this.gradientId}`;
		return h('svg', {
			viewBox: `0 0 ${this.width} ${this.height}`,
			preserveAspectRatio: 'xMidYMid meet',
			style: { width: '100%' },
		}, [
			h('defs', [
				h('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '0' }, [
					h('stop', { offset: '0%', 'stop-color': this.primary }),
					h('stop', { offset: '50%', 'stop-color': this.secondary }, [
						h('animate', { attributeName: 'offset', values: '-1;2', dur: '1.6s', repeatCount: 'indefinite' }),
					]),
					h('stop', { offset: '100%', 'stop-color': this.primary }),
				]),
			]),
			h('g', { fill: `url(#${id})` }, this.$slots.default?.() ?? []),
		]);
	},
});
