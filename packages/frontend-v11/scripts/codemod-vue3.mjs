/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Applies the mechanical part of the Vue 2 -> Vue 3 migration to the vendored v11 client.
//
// Only transformations that are unambiguous belong here. Anything needing a judgement call — the
// filter expressions, `$children`, the packages with no Vue 3 successor — is deliberately left for
// a human to look at, and `--report` lists what remains.
//
//   node scripts/codemod-vue3.mjs [--dry] [--report]

import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const reportOnly = args.includes('--report');

const root = resolve(process.cwd(), 'vendor/misskey-11.37.1/src/client');

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...walk(path));
		else if (/\.(vue|ts|js)$/.test(entry)) out.push(path);
	}
	return out;
}

/** Rewrites that are safe to apply blindly. */
const rewrites = [
	// `Vue.extend({...})` has no Vue 3 equivalent; `defineComponent` is the direct replacement.
	{ name: 'Vue.extend -> defineComponent', find: /\bVue\.extend\(/g, replace: 'defineComponent(' },

	// Lifecycle hooks renamed.
	{ name: 'beforeDestroy -> beforeUnmount', find: /\bbeforeDestroy\s*\(/g, replace: 'beforeUnmount(' },
	{ name: 'destroyed -> unmounted', find: /(\n\t*)destroyed\s*\(/g, replace: '$1unmounted(' },

	// `$listeners` folded into `$attrs`, and `$destroy` is gone.
	{ name: '$listeners -> $attrs', find: /\$listeners/g, replace: '$attrs' },

	// `$set` / `$delete` are unnecessary: Vue 3 reactivity tracks plain assignment.
	{ name: '$set(a, b, c) -> a[b] = c', find: /this\.\$set\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g, replace: '$1[$2] = $3' },
	{ name: '$delete(a, b) -> delete a[b]', find: /this\.\$delete\(([^,]+),\s*([^)]+)\)/g, replace: 'delete $1[$2]' },

	// The `.native` modifier was removed; Vue 3 falls through automatically.
	{ name: 'remove .native modifier', find: /(@[a-zA-Z][\w-]*)\.native\b/g, replace: '$1' },
];

/** Things a person still has to decide about. */
const manual = [
	{ name: 'template filter (|)', find: /\|\s*[a-zA-Z_$][\w$]*\s*(?:"|'|\}\})/g },
	{ name: 'filters: block', find: /^\s*filters:\s*\{/gm },
	{ name: '$children', find: /\$children\b/g },
	{ name: 'new Vue(', find: /new Vue\(/g },
	{ name: 'Vue.component(', find: /Vue\.component\(/g },
	{ name: 'Vue.directive(', find: /Vue\.directive\(/g },
	{ name: 'Vue.mixin(', find: /Vue\.mixin\(/g },
	{ name: '$destroy()', find: /\$destroy\(/g },
	{ name: '.sync modifier', find: /\.sync\b/g },
	{ name: 'removed package import', find: /from '(?:vue-js-modal|vue-prism-component|vue-color|vue-cropperjs|vue-json-pretty|vue-content-loading|vuewordcloud|vue-marquee-text-component|v-animate-css|v-debounce|vue-sequential-entrance|bootstrap-vue)'/g },
];

const files = walk(root);
const applied = Object.fromEntries(rewrites.map(r => [r.name, 0]));
const remaining = Object.fromEntries(manual.map(m => [m.name, 0]));
const remainingFiles = Object.fromEntries(manual.map(m => [m.name, new Set()]));
let changedFiles = 0;

for (const path of files) {
	const original = await readFile(path, 'utf8');
	let text = original;

	if (!reportOnly) {
		for (const rule of rewrites) {
			const before = text;
			text = text.replace(rule.find, rule.replace);
			if (text !== before) applied[rule.name] += (before.match(rule.find) ?? []).length;
		}

		// `defineComponent` has to be imported wherever it is now used.
		if (/\bdefineComponent\(/.test(text) && !/\bdefineComponent\b[^(]*from 'vue'/.test(text)) {
			text = text.replace(/^(\s*)import Vue from 'vue';/m, "$1import { defineComponent } from 'vue';");
		}
	}

	for (const rule of manual) {
		const hits = text.match(rule.find);
		if (hits) {
			remaining[rule.name] += hits.length;
			remainingFiles[rule.name].add(path.slice(root.length + 1));
		}
	}

	if (text !== original) {
		changedFiles++;
		if (!dryRun && !reportOnly) await writeFile(path, text, 'utf8');
	}
}

if (!reportOnly) {
	console.log(`${dryRun ? '[dry run] ' : ''}rewrote ${changedFiles} of ${files.length} files\n`);
	for (const [name, count] of Object.entries(applied)) {
		if (count) console.log(`  ${String(count).padStart(5)}  ${name}`);
	}
	console.log();
}

console.log('still needs a decision:');
for (const [name, count] of Object.entries(remaining)) {
	if (!count) continue;
	console.log(`  ${String(count).padStart(5)}  ${name}  (${remainingFiles[name].size} files)`);
}
