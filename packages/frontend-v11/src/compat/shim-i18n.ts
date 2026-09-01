/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Imported by file path, not by name: the bare `vue-i18n` specifier is aliased to this module.
import { createI18n } from 'vue-i18n/dist/vue-i18n.esm-bundler.js';

export * from 'vue-i18n/dist/vue-i18n.esm-bundler.js';

/**
 * `vue-i18n` 8 compatibility.
 *
 * v11's `app/i18n.ts` returns plain *options*, not an instance, and 237 components pass their own
 * scoped copy as a component-level `i18n` option so that `$t('title')` resolves inside that
 * component's namespace. vue-i18n 9's legacy mode keeps both behaviours, so the only thing missing
 * is the step that turns the root options into an instance — v8 did that implicitly.
 */

export interface LegacyI18nOptions {
	locale?: string;
	messages?: Record<string, unknown>;
	sync?: boolean;
	[key: string]: unknown;
}

/** True for the options object v11 hands to the root app, false for an already-built instance. */
export function isLegacyI18nOptions(value: unknown): value is LegacyI18nOptions {
	return value != null
		&& typeof value === 'object'
		&& typeof (value as { install?: unknown }).install !== 'function'
		&& 'messages' in value;
}

/**
 * vue-i18n 8's `BaseFormatter`, as a vue-i18n 9 message compiler.
 *
 * v9 replaced the formatter with a real parser, and v11's locale does not survive it: 34 messages
 * use `{}` as a positional slot, and ordinary prose contains `{{query}}` and `{ 変数名 }` — all of
 * which v9 rejects outright ("Empty placeholder"). v8 recognised exactly one shape, `{word}`, and
 * left every other brace alone, so reproducing that rule keeps the messages rendering the way they
 * were written instead of failing to compile.
 */
const PLACEHOLDER = /\{([a-zA-Z0-9_.]+)\}/g;

interface MessageContext {
	named(key: string): unknown;
	list(index: number): unknown;
}

function compileLegacyMessage(message: string) {
	const compiled = (ctx: MessageContext): string => message.replace(PLACEHOLDER, (whole, key: string) => {
		// v8 read a numeric name off the positional list and anything else off the named values.
		const value = /^\d+$/.test(key) ? ctx.list(Number(key)) : ctx.named(key);
		return value == null ? whole : String(value);
	});
	// vue-i18n inspects this to decide a function is a message, not a nested message object.
	(compiled as { source?: string }).source = message;
	return compiled;
}

/**
 * Converts a locale tree of strings into one of message functions.
 *
 * A `messageCompiler` on `createI18n` only covers the root instance, and v11 gives 237 components
 * their own scoped `i18n` option — those compile through vue-i18n's own parser no matter what the
 * root was configured with. Pre-compiling sidesteps the parser entirely: vue-i18n calls a message
 * function as-is and never tries to parse it.
 */
const precompiled = new WeakMap<object, unknown>();

export function precompileMessages<T>(node: T): T {
	if (typeof node === 'string') return compileLegacyMessage(node) as unknown as T;
	if (node == null || typeof node !== 'object') return node;

	// `i18n.ts` grafts the shared `common` tree onto every scope as `@`, so the same objects recur
	// across all 237 scopes and — when the scope *is* `common` — onto themselves. Recording the
	// result before descending both terminates that cycle and keeps the work linear.
	const cached = precompiled.get(node);
	if (cached !== undefined) return cached as T;

	const out: Record<string, unknown> | unknown[] = Array.isArray(node) ? [] : {};
	precompiled.set(node, out);
	for (const [key, value] of Object.entries(node)) {
		(out as Record<string, unknown>)[key] = precompileMessages(value);
	}
	return out as unknown as T;
}

export function createLegacyI18n(options: LegacyI18nOptions) {
	return createI18n({
		legacy: true,
		globalInjection: true,
		messageCompiler: (message: unknown) =>
			(typeof message === 'string' ? compileLegacyMessage(message) : message),
		// v11 puts HTML in messages deliberately (`<b>`, `<a>`), and renders it through `v-html` at
		// the call sites that need it, so v9's warning about it is noise.
		warnHtmlInMessage: 'off',
		fallbackWarn: false,
		missingWarn: false,
		...options,
	} as never);
}

/**
 * v11 calls `Vue.use(VueI18n)`. In vue-i18n 9 the instance installs itself, so this only has to
 * absorb the call — the `__vue2Only` flag tells the `Vue.use` shim to drop it.
 */
export default { __vue2Only: true };
