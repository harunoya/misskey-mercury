/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp, getCurrentInstance, type App, type Component } from 'vue';
import { installEventApi } from './events';

/**
 * `new SomeComponent({ parent, propsData })` for Vue 3.
 *
 * Every window, dialog and picker in v11 is created this way — 271 call sites go through
 * `$root.new`, `$root.newAsync` or `$root.dialog`. Vue 3 removed the constructor form: a component
 * is a plain object, and only an app can be mounted. So each detached component gets its own app,
 * mounted into a throwaway element that the caller then places itself, exactly as before.
 *
 * The child app is wired into the root app's context rather than started clean. Without that it
 * would have no global components (`mk-*`), no `$store`, no `$router` and no `$t`, and every dialog
 * would render empty.
 */

let rootApp: App | null = null;
let rootInstance: unknown = null;

/** Called once the main app exists, so detached components can inherit its context. */
export function setRootApp(app: App): void {
	rootApp = app;
}

/**
 * Records the main app's root component, mounted.
 *
 * `$root` is per-app in Vue 3, so a dialog in its own app would otherwise see itself as the root —
 * and v11 reaches through `$root` constantly (`$root.getMeta()`, `$root.dialog()`, `$root.os`).
 */
export function setRootInstance(instance: unknown): void {
	rootInstance = instance;
}

/** Mounted root instance → the call that unmounts the app it belongs to. */
const teardowns = new WeakMap<object, () => void>();

/**
 * Vue 2's `vm.$destroy()`, for the components that were created detached.
 *
 * v11's global `destroyDom` mixin tears a dialog or menu down from inside itself. Vue 3 has no
 * per-instance destroy — only the owning app can be unmounted — so the instance is looked up here.
 * A component that was not created detached has no app of its own to unmount; removing its element
 * is then all `destroyDom` can honestly do, which is what the mixin falls back to.
 */
export function destroyDetached(instance: object): boolean {
	// `destroyDom` is usually called from a child — `ui-modal` closes the dialog that contains it —
	// so the search walks up to the component the app was mounted with. `$parent` rather than
	// `$root`, because `$root` is deliberately redirected to the main app above.
	let current: { $parent?: object } | undefined = instance;
	while (current != null) {
		const teardown = teardowns.get(current as object);
		if (teardown != null) {
			teardown();
			return true;
		}
		current = current.$parent;
	}
	return false;
}

export interface DetachedInstance {
	$el?: Element;
	$mount(): DetachedInstance;
	$destroy(): void;
	[key: string]: unknown;
}

export function createDetachedComponent(component: Component, props?: Record<string, unknown>): DetachedInstance {
	const app = createApp(component as never, props as never);

	if (rootApp != null) {
		const from = rootApp._context;
		const to = app._context;
		to.components = from.components;
		to.directives = from.directives;
		// Copied, not aliased: `app.mixin()` below pushes into this array, and sharing it would
		// append a duplicate global mixin to the root app every time a dialog opens.
		to.mixins = [...from.mixins];
		// `inject` walks the prototype chain, so provides can be inherited — a child writing its own
		// value then does not leak back up.
		to.provides = Object.create(from.provides);
		// Global properties cannot: Vue resolves them with `hasOwn`, which ignores the prototype
		// chain, so `$store` and `$router` have to be copied onto the child app itself. Detached
		// components are only ever created after boot, so the root's set is already complete.
		Object.assign(app.config.globalProperties, rootApp.config.globalProperties);
	}

	// Point this app's root at the main app's, so `$root` keeps meaning what v11 expects. Doing it
	// in `beforeCreate` on the app's own root component is what makes it stick: children copy
	// `root` from their parent when they are created, which happens after this runs.
	if (rootInstance != null) {
		app.mixin({
			beforeCreate() {
				const internal = getCurrentInstance() as { parent?: unknown; root?: unknown } | null;
				if (internal != null && internal.parent == null) internal.root = rootInstance;
			},
		});
	}

	installEventApi(app);

	const host = document.createElement('div');
	let instance: Record<string, unknown> | null = null;

	const wrapper = {
		$mount() {
			instance = app.mount(host) as unknown as Record<string, unknown>;
			// Registered on the wrapper root: `destroyDetached` walks `$parent` up from wherever
			// `destroyDom` was called, and every component in this app ends up here.
			teardowns.set(instance, () => wrapper.$destroy());
			return proxy;
		},

		get $el() {
			// v11 appends this to the document itself, so hand back the mounted root, not the host.
			return (instance?.$el as Element | undefined) ?? host;
		},

		$destroy() {
			app.unmount();
			host.remove();
		},
	};

	// Dialogs call their own methods on the returned object (`vm.close()`), which in Vue 2 was the
	// component instance itself.
	/**
	 * The component's own props object, which is where a post-mount prop write has to land.
	 *
	 * Vue 2 let the creator write straight to the instance, and v11 relies on it: the autocomplete
	 * directive sets `suggestion.q` on every keystroke, and the pickers follow the caret by setting
	 * `x`/`y`. Vue 3 exposes props read-only on the public instance, so those writes were dropped and
	 * the suggestion list stayed on the query it was opened with — an empty one, which lists only
	 * custom emojis.
	 *
	 * `$.props` is Vue's internal shallow-reactive props object. Writing there updates just this
	 * component. Rendering it through a wrapper whose props were reactive would be the tidier shape,
	 * but v11 moves the mounted element out of its container (`document.body.appendChild(vm.$el)`),
	 * and a parent patching a subtree whose DOM has moved crashes the renderer.
	 */
	const propsOf = (vm: Record<string, unknown> | null): Record<string, unknown> | null => {
		const internal = vm?.$ as { props?: Record<string, unknown> } | undefined;
		return internal?.props ?? null;
	};

	const proxy: DetachedInstance = new Proxy(wrapper, {
		get(self, key, receiver) {
			if (key in self) return Reflect.get(self, key, receiver);
			const value = instance?.[key as string];
			return typeof value === 'function' ? value.bind(instance) : value;
		},
		set(self, key, value) {
			const props = propsOf(instance);
			if (props != null && Object.prototype.hasOwnProperty.call(props, key)) {
				props[key as string] = value;
				return true;
			}
			if (instance != null && !(key in self)) {
				instance[key as string] = value;
				return true;
			}
			return Reflect.set(self, key, value);
		},
		has(self, key) {
			return key in self || (instance != null && key in instance);
		},
	}) as DetachedInstance;

	return proxy;
}
