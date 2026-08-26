/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Import the real Vue by its file path: the bare `vue` specifier is aliased to this module, so
// importing it by name here would resolve back onto itself.
import {
	createApp,
	defineComponent,
	h,
	nextTick,
	reactive,
	type App,
	type Component,
	type Directive,
	type Plugin,
} from 'vue/dist/vue.esm-bundler.js';

export * from 'vue/dist/vue.esm-bundler.js';

import { setRootApp, setRootInstance } from './detached';
import { installEventApi } from './events';
import { installFilters } from './filters';
import { createLegacyI18n, isLegacyI18nOptions } from './shim-i18n';

/**
 * A stand-in for Vue 2's global `Vue` object.
 *
 * v11 registers everything up front — `Vue.use`, `Vue.component`, `Vue.mixin` — and only then calls
 * `new Vue()`. Vue 3 moved all of that onto the app instance, which does not exist until the last
 * step. Rather than reorder the vendored bootstrap, registrations are queued here and replayed onto
 * the app the moment it is created, so the original call order still holds.
 */

type QueuedPlugin = [Plugin, unknown];

const plugins: QueuedPlugin[] = [];
const components: [string, Component][] = [];
const directives: [string, Directive][] = [];
const mixins: object[] = [];

let createdApp: App | null = null;

/** Populated by `common/views/filters/`, which `init.ts` requires during boot. */
const filterRegistry = new Map<string, (...args: unknown[]) => unknown>();

/** Mirrors what has been registered, so `Vue.component(name)` can look it up as it used to. */
const registeredComponents = new Map<string, Component>();

function register<T>(queue: T[], entry: T, apply: (app: App) => void): void {
	// Anything registered after boot has to go straight to the live app, or it silently vanishes.
	if (createdApp != null) apply(createdApp);
	else queue.push(entry);
}

export const VueGlobal = {
	use(plugin: Plugin, options?: unknown) {
		// Vue 2 required registering Vuex and vue-router as plugins; in Vue 3 the store and the
		// router install themselves, and handing their module namespace to `app.use` would either
		// warn or throw. `Vue.use` on them is now nothing but a leftover call.
		if (plugin == null || (plugin as { __vue2Only?: boolean }).__vue2Only) return VueGlobal;
		if (typeof plugin !== 'function' && typeof (plugin as { install?: unknown }).install !== 'function') {
			return VueGlobal;
		}

		register(plugins, [plugin, options] as QueuedPlugin, app => app.use(plugin as never, options as never));
		return VueGlobal;
	},

	/**
	 * Vue 2 returned the registered component, and `mfm.ts` exports the result of its own
	 * registration — returning the global object there would export something that cannot render.
	 * Called with a name alone it is a lookup, exactly as in Vue 2.
	 */
	component(name: string, component?: Component) {
		if (component === undefined) return registeredComponents.get(name);
		registeredComponents.set(name, component);
		register(components, [name, component], app => app.component(name, component));
		return component;
	},

	directive(name: string, directive: Directive) {
		register(directives, [name, directive], app => app.directive(name, directive));
		return VueGlobal;
	},

	mixin(mixin: object) {
		register(mixins, mixin, app => app.mixin(mixin));
		return VueGlobal;
	},

	/**
	 * Filters are gone from Vue 3, but only as *template* syntax — the registry behind them is still
	 * read directly. v11 calls `Vue.filter('bytes')` to get a formatter for a chart axis or a
	 * tooltip, where there is no template to rewrite, so the registry has to stay.
	 */
	filter(name: string, fn?: (...args: unknown[]) => unknown) {
		if (fn === undefined) return filterRegistry.get(name);
		filterRegistry.set(name, fn);
		return fn;
	},

	extend: defineComponent,
	nextTick,
	observable: reactive,

	set<T>(target: Record<string, T>, key: string, value: T): T {
		target[key] = value;
		return value;
	},

	delete(target: Record<string, unknown>, key: string): void {
		delete target[key];
	},
};

/** Replays everything queued before the app existed. Called by the `new Vue()` replacement. */
export function flushInto(app: App): App {
	createdApp = app;
	for (const [plugin, options] of plugins) app.use(plugin as never, options as never);
	for (const [name, component] of components) app.component(name, component);
	for (const [name, directive] of directives) app.directive(name, directive);
	for (const mixin of mixins) app.mixin(mixin);
	plugins.length = components.length = directives.length = mixins.length = 0;
	return app;
}

class VueAppImpl {
	readonly app: App;
	instance: Record<string, unknown> | null = null;

	constructor(options: Record<string, unknown>) {
		// Vue 2 handed the render function `createElement`; Vue 3 calls it with the render context
		// and expects the component to use the imported `h`. Binding `h` as the first argument keeps
		// the vendored `render: createEl => createEl(App)` working as written.
		const patched = { ...options };
		const render = patched.render as ((...args: unknown[]) => unknown) | undefined;
		if (typeof render === 'function' && render.length > 0) {
			patched.render = function (this: unknown) { return render.call(this, h); };
		}

		// v11's `i18n()` returns options because vue-i18n 8 built the instance for you; vue-i18n 9
		// needs it built explicitly. Component-level `i18n` options are left alone — legacy mode
		// still reads those, which is what keeps `$t('title')` scoped per component.
		if (isLegacyI18nOptions(patched.i18n)) patched.i18n = createLegacyI18n(patched.i18n);

		this.app = flushInto(createApp(patched as never));
		installEventApi(this.app);
		installFilters(this.app);
		setRootApp(this.app);

		// Vue 2 read these straight off the options; Vue 3 requires installing them.
		for (const key of ['router', 'store', 'i18n'] as const) {
			const plugin = patched[key] as { install?: unknown } | undefined;
			if (plugin != null && typeof plugin.install === 'function') this.app.use(plugin as never);
		}
	}

	$mount(selector?: string | Element) {
		const target = selector ?? document.createElement('div');
		if (typeof target !== 'string' && !target.isConnected) document.body.appendChild(target);
		this.instance = this.app.mount(target as never) as Record<string, unknown>;

		// Detached components redirect their `$root` here, and that needs the internal instance —
		// `mount` hands back the public proxy. Read it off the container, which holds the mounted
		// vnode; `app._instance` is not reliably populated here.
		const container = typeof target === 'string' ? document.querySelector(target) : target;
		const mounted = (container as { _vnode?: { component?: unknown } } | null)?._vnode?.component;
		setRootInstance(mounted ?? (this.app as unknown as { _instance?: unknown })._instance);

		return proxied.get(this) ?? this.instance;
	}

	get $el() {
		return (this.instance as { $el?: Element } | null)?.$el;
	}

	$destroy() {
		this.app.unmount();
	}
}

const proxied = new WeakMap<VueAppImpl, unknown>();

/**
 * Replacement for `new Vue(options)`.
 *
 * Vue 2 returned a component instance you then mounted; Vue 3 returns an app you mount to get the
 * instance. The wrapper keeps `$mount` so the vendored bootstrap does not have to change, and
 * forwards every other property to the mounted root — v11 stores this object as `os.app` and reads
 * root methods off it (`$root.getMeta()`, `$root.dialog()`, `$root.new()`), which in Vue 2 lived on
 * the very object the constructor returned.
 */
export const VueApp = new Proxy(VueAppImpl, {
	construct(target, args: [Record<string, unknown>]) {
		const impl = new target(...args);
		const proxy = new Proxy(impl, {
			get(self, key, receiver) {
				if (key in self) return Reflect.get(self, key, receiver);
				const value = self.instance?.[key as string];
				return typeof value === 'function' ? value.bind(self.instance) : value;
			},
			has(self, key) {
				return key in self || (self.instance != null && key in self.instance);
			},
		});
		proxied.set(impl, proxy);
		return proxy as never;
	},
});

export default VueGlobal;
