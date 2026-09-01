/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getCurrentInstance } from 'vue';
import type { App, ComponentPublicInstance } from 'vue';

/**
 * Vue 2's instance event API, removed in Vue 3.
 *
 * v11 leans on it in two ways `v-on` cannot express: components subscribe to a sibling or a parent
 * they were handed as a ref (`this.$refs.tl.$once('loaded', ...)`), and several use `$root` as an
 * application-wide bus. Both patterns outlive the template, so there is nothing to rewrite them
 * into — the emitter itself has to come back.
 *
 * `$emit` is wrapped rather than replaced: Vue 3 still needs to fire the declared `v-on` handlers,
 * so the original runs first and the extra listeners are notified afterwards.
 */

type Handler = (...args: unknown[]) => void;

const buses = new WeakMap<object, Map<string, Set<Handler>>>();

function busFor(target: object): Map<string, Set<Handler>> {
	let bus = buses.get(target);
	if (bus == null) {
		bus = new Map();
		buses.set(target, bus);
	}
	return bus;
}

function on(this: object, event: string | string[], handler: Handler) {
	for (const name of Array.isArray(event) ? event : [event]) {
		const bus = busFor(this);
		let set = bus.get(name);
		if (set == null) {
			set = new Set();
			bus.set(name, set);
		}
		set.add(handler);
	}
	return this;
}

function off(this: object, event?: string | string[], handler?: Handler) {
	const bus = buses.get(this);
	if (bus == null) return this;

	if (event == null) {
		bus.clear();
		return this;
	}

	for (const name of Array.isArray(event) ? event : [event]) {
		if (handler == null) bus.delete(name);
		else bus.get(name)?.delete(handler);
	}
	return this;
}

function once(this: object, event: string, handler: Handler) {
	const wrapped: Handler = (...args) => {
		off.call(this, event, wrapped);
		handler.apply(this, args);
	};
	// Vue 2 matched the original handler when `$off` was called with it, so keep the link.
	(wrapped as { fn?: Handler }).fn = handler;
	return on.call(this, event, wrapped);
}

/** Fires the listeners registered through this shim. Returns nothing; `$emit`'s value is Vue's. */
function dispatch(target: object, event: string, args: unknown[]) {
	const set = buses.get(target)?.get(event);
	if (set == null) return;
	// Copied first: a `$once` handler removes itself from the live set while it runs.
	for (const handler of [...set]) handler.apply(target, args);
}

export function installEventApi(app: App) {
	// `$on`/`$off`/`$once` are free names in Vue 3 — it deleted them — so they can simply be global.
	// The bus is keyed on `this`, which is the calling component's proxy.
	Object.assign(app.config.globalProperties, { $on: on, $off: off, $once: once });

	app.mixin({
		created(this: ComponentPublicInstance) {
			// `$emit` is still Vue's own, and its public proxy rejects writes to `$`-prefixed names.
			// The internal instance's `emit` is a plain property, and `$emit` delegates to it, so
			// replacing it there is what actually takes effect.
			const internal = getCurrentInstance();
			if (internal == null) return;

			const nativeEmit = internal.emit;
			const proxy = this;
			internal.emit = (event: string, ...args: unknown[]) => {
				const result = nativeEmit(event, ...args);
				dispatch(proxy as object, event, args);
				return result;
			};
		},

		beforeUnmount(this: ComponentPublicInstance) {
			// Vue 2 emitted every lifecycle hook as a `hook:*` event; v11 uses `hook:beforeDestroy`
			// in 18 places to clean up after a window it opened. Vue 3 dropped the convention, so
			// the one hook that is actually listened for is re-emitted here.
			dispatch(this as object, 'hook:beforeDestroy', []);
		},

		unmounted(this: ComponentPublicInstance) {
			buses.delete(this as object);
		},
	});
}
