/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Declares `emits` on the vendored components whose event names collide with a native DOM event.
//
// In Vue 2, `@input` on a component was always a custom listener: it fired only when the component
// called `$emit('input', …)`. Vue 3 changed that. An undeclared listener falls through to the root
// element as a *native* listener, so `@input="name = $event"` on `<ui-input>` now also fires for
// the DOM `input` event bubbling out of the `<input>` inside it — and `name` becomes an InputEvent
// instead of the string the component emitted. The same fallthrough makes every `<ui-button>` run
// its handler twice: once natively, once from `$emit('click')`.
//
// Declaring `emits` is the documented fix and restores the Vue 2 contract exactly: a declared
// event is removed from `$attrs`, so the listener stops being attached to the root element and
// only the component's own `$emit` reaches it.
//
//   node scripts/codemod-emits.mjs [--check]

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = resolve(packageRoot, 'vendor/misskey-11.37.1/src/client/app');
const check = process.argv.includes('--check');

// Event names that exist as DOM events on, or bubble up to, an element a v11 component can have as
// its root. Anything outside this set behaves identically declared or not, and is left alone so
// the diff against upstream stays limited to what actually changed behaviour.
const nativeEvents = new Set([
	'click', 'dblclick', 'input', 'change', 'focus', 'blur', 'submit', 'reset', 'select',
	'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 'mousemove',
	'contextmenu', 'wheel', 'scroll', 'paste', 'copy', 'cut', 'drop', 'dragstart', 'dragend',
	'close', 'cancel', 'toggle', 'load', 'error',
]);

const emitPattern = /\$emit\(\s*['"]([a-zA-Z0-9:_-]+)['"]/g;
const optionsPattern = /export default defineComponent\(\{\n/;

async function* vueFiles(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* vueFiles(path);
		else if (entry.name.endsWith('.vue')) yield path;
	}
}

const changed = [];
const skipped = [];

for await (const path of vueFiles(clientRoot)) {
	const source = await readFile(path, 'utf8');
	const emitted = [...new Set([...source.matchAll(emitPattern)].map(m => m[1]))].sort();
	if (!emitted.some(name => nativeEvents.has(name))) continue;
	if (/^\s*emits\s*:/m.test(source)) continue;

	const name = relative(clientRoot, path).replaceAll('\\', '/');
	if (!optionsPattern.test(source)) {
		skipped.push(name);
		continue;
	}

	// Every emitted name is declared, not just the colliding ones: a component's `emits` is meant
	// to be its full event list, and the extras cost nothing.
	const declaration = `\temits: [${emitted.map(event => `'${event}'`).join(', ')}],\n`;
	const patched = source.replace(optionsPattern, match => match + declaration);

	if (!check) await writeFile(path, patched);
	changed.push(`${name} -> ${emitted.join(', ')}`);
}

for (const line of changed) console.log(`  ${check ? 'would patch' : 'patched'} ${line}`);
for (const name of skipped) console.error(`  ! no defineComponent options object: ${name}`);
console.log(`${changed.length} component(s), ${skipped.length} skipped`);

if (skipped.length > 0) process.exitCode = 1;
