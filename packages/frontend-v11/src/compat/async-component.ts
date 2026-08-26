/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, type Component } from 'vue';

/**
 * Makes a Vue 2 async component factory renderable by `<component :is>`.
 *
 * v11 routes several pages by handing a loader — `() => import('…').then(m => m.default)` — to a
 * layout as a prop. Vue 2's `:is` understood that; Vue 3 sees a bare function, treats it as a
 * functional component, calls it, and renders the returned Promise as `[object Promise]`. Wrapping
 * it in `defineAsyncComponent` restores the original meaning.
 *
 * The wrapper is cached by factory identity: `:is` re-evaluates on every render, and a fresh async
 * component each time would remount the page and re-run its `import`.
 */

const wrapped = new WeakMap<object, Component>();

export function asAsyncComponent(value: unknown): unknown {
	if (typeof value !== 'function') return value;

	let component = wrapped.get(value);
	if (component == null) {
		component = defineAsyncComponent(value as never);
		wrapped.set(value, component);
	}
	return component;
}
