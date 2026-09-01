/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineComponent, h } from 'vue';

/** Vue 3 replacement for the small scrolling wrapper used by the v11 admin dashboard. */
export default defineComponent({
	name: 'V11MarqueeText',
	props: {
		repeat: { type: Number, default: 2 },
		duration: { type: Number, default: 20 },
	},
	render() {
		const copies = Array.from({ length: Math.max(2, this.repeat) }, (_, index) =>
			h('span', { class: 'mercury-v11-marquee-copy', key: index }, this.$slots.default?.()));
		return h('div', { class: 'mercury-v11-marquee' }, [
			h('div', {
				class: 'mercury-v11-marquee-track',
				style: { animationDuration: `${Math.max(1, this.duration)}s` },
			}, copies),
		]);
	},
});
