/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Imported by file path, not by name: the bare `vue-router` specifier is aliased to this module.
// `vue-router.mjs` rather than the esm-bundler build, which warns when imported by its deep path.
import {
	createRouter,
	createWebHashHistory,
	createWebHistory,
	type Router,
	type RouteRecordRaw,
} from 'vue-router/dist/vue-router.mjs';

export * from 'vue-router/dist/vue-router.mjs';

/**
 * `new VueRouter(options)` for vue-router 4.
 *
 * v11 builds five routers this way (desktop, mobile, admin, auth, dev). Only three things changed
 * between v3 and v4 for the shapes it uses: the constructor became a factory, `mode` became a
 * history object, and the `*` catch-all became a named wildcard parameter. Everything the client
 * touches at runtime — `$route.params`, `$route.name`, `$route.query`, `$router.push/replace` —
 * carries over unchanged, so nothing beyond construction needs a shim.
 */

interface LegacyRouterOptions {
	mode?: 'history' | 'hash' | 'abstract';
	base?: string;
	routes?: RouteRecordRaw[];
	scrollBehavior?: unknown;
	[key: string]: unknown;
}

/** v4 dropped bare `*`; the equivalent is a repeated catch-all parameter. */
function convertWildcards(routes: RouteRecordRaw[]): RouteRecordRaw[] {
	return routes.map(route => {
		const converted: RouteRecordRaw = { ...route };
		if (converted.path === '*') {
			converted.path = '/:pathMatch(.*)*';
			// A wildcard route needs a name in v4 only if something links to it by name; v11 does not.
		}
		if (Array.isArray(converted.children)) {
			converted.children = convertWildcards(converted.children);
		}
		return converted;
	});
}

export class VueRouterShim {
	/** Tells the `Vue.use` shim to drop `Vue.use(VueRouter)` instead of calling this as an installer. */
	static readonly __vue2Only = true;

	constructor(options: LegacyRouterOptions = {}) {
		const { mode, base, routes = [], ...rest } = options;
		const history = mode === 'hash'
			? createWebHashHistory(base)
			: createWebHistory(base);

		// The factory returns a plain object, so returning it from the constructor is what makes
		// `new VueRouter(...)` yield a usable v4 router.
		return createRouter({
			history,
			routes: convertWildcards(routes),
			...rest,
		} as never) as unknown as VueRouterShim;
	}
}

export type { Router };

export default VueRouterShim;
