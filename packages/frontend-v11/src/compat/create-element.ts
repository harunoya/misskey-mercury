/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { h, resolveDirective, resolveDynamicComponent, withDirectives } from 'vue';
import type { VNode } from 'vue';

/**
 * Vue 2's `createElement`, on top of Vue 3's `h`.
 *
 * The MFM renderer is the one part of v11 that builds its tree by hand rather than from a template,
 * and it uses the Vue 2 vnode data object throughout — `attrs`, `props`, `on`, `directives`, all
 * nested. Vue 3 flattened that into a single props object, moved directives to `withDirectives`,
 * and stopped resolving component names passed as strings. Translating here keeps the thirty-odd
 * call sites in `mfm.ts` exactly as upstream wrote them; rewriting each one by hand is where the
 * rendering of every note, display name and bio would quietly drift.
 */

interface Vue2VNodeData {
	attrs?: Record<string, unknown>;
	props?: Record<string, unknown>;
	domProps?: Record<string, unknown>;
	on?: Record<string, unknown>;
	nativeOn?: Record<string, unknown>;
	directives?: ({ name?: string; value?: unknown; arg?: string; modifiers?: Record<string, boolean> } | Record<string, never>)[];
	class?: unknown;
	style?: unknown;
	key?: unknown;
	ref?: unknown;
}

type Children = VNode | VNode[] | string | number | null | undefined;

/** Vue 2 resolved a string tag against registered components; Vue 3 only does so on request. */
function resolveTag(tag: unknown): unknown {
	if (typeof tag !== 'string') return tag;
	// Plain lowercase names are HTML elements. Anything hyphenated (`mk-emoji`, `router-link`) was
	// a component in v11, and `resolveDynamicComponent` falls back to the string if it is not one.
	return tag.includes('-') ? resolveDynamicComponent(tag) : tag;
}

function isDataObject(value: unknown): value is Vue2VNodeData {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function createElement(tag: unknown, data?: Vue2VNodeData | Children, children?: Children): VNode {
	if (!isDataObject(data)) {
		children = data as Children;
		data = undefined;
	}

	const props: Record<string, unknown> = {};

	if (data != null) {
		// Vue 3 makes no distinction between attributes, props and DOM properties.
		Object.assign(props, data.attrs, data.props, data.domProps);

		if (data.class != null) props.class = data.class;
		if (data.style != null) props.style = data.style;
		if (data.key != null) props.key = data.key;
		if (data.ref != null) props.ref = data.ref;

		// `on: { click }` became `onClick`. `nativeOn` is gone: on a component, a listener that is
		// not declared as an emit already falls through to the root element.
		for (const [event, handler] of Object.entries({ ...data.on, ...data.nativeOn })) {
			props[`on${event.charAt(0).toUpperCase()}${event.slice(1)}`] = handler;
		}
	}

	const resolved = resolveTag(tag);

	// A component takes slots, not a children array; passing the array works but makes Vue warn on
	// every note it renders.
	const isComponent = typeof resolved !== 'string';
	const slotted = isComponent && children != null ? { default: () => children } : children;

	const vnode = slotted === undefined
		? h(resolved as never, props)
		: h(resolved as never, props, slotted as never);

	const directives = (data?.directives ?? []).filter(
		(directive): directive is { name: string; value?: unknown; arg?: string; modifiers?: Record<string, boolean> } =>
			directive != null && typeof (directive as { name?: unknown }).name === 'string',
	);
	if (directives.length === 0) return vnode;

	return withDirectives(vnode, directives.map(directive => [
		resolveDirective(directive.name),
		directive.value,
		directive.arg,
		directive.modifiers,
	] as never));
}

export default createElement;
