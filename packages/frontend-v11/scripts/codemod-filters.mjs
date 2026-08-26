/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Rewrites v11's template filters into ordinary function calls.
//
// Vue 3 removed filters, and it does so silently: `note | notePage` still parses, as a bitwise OR
// between two expressions, so a missed occurrence produces a wrong value rather than an error. That
// makes a blanket sweep safer than fixing them as they surface.
//
// Only the seven names v11 actually registers are touched, and only inside the template block, so
// real `|` operators in script code are left alone.
//
//   node scripts/codemod-filters.mjs [--dry]

import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dryRun = process.argv.includes('--dry');
const root = resolve(process.cwd(), 'vendor/misskey-11.37.1/src/client');

const FILTERS = ['userPage', 'notePage', 'userName', 'json5', 'bytes', 'number', 'acct'];

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...walk(path));
		else if (entry.endsWith('.vue')) out.push(path);
	}
	return out;
}

/**
 * Turns `subject | name` and `subject | name(arg)` into `name(subject)` / `name(subject, arg)`.
 * Applied repeatedly so chains like `a | acct | number` unwind from the left.
 */
function rewriteFilters(source) {
	let text = source;
	let total = 0;

	for (let pass = 0; pass < 4; pass++) {
		let passCount = 0;

		for (const name of FILTERS) {
			// The subject is everything back to the delimiter that opened the expression. Kept
			// deliberately narrow — no nested pipes on the left — which the repeat passes handle.
			const withArgs = new RegExp(`([^|"'\`=<>({\\[,]+?)\\s*\\|\\s*${name}\\(([^)]*)\\)`, 'g');
			const bare = new RegExp(`([^|"'\`=<>({\\[,]+?)\\s*\\|\\s*${name}(?![\\w(])`, 'g');

			text = text.replace(withArgs, (_match, subject, args) => {
				passCount++;
				return `${name}(${subject.trim()}, ${args})`;
			});
			text = text.replace(bare, (_match, subject) => {
				passCount++;
				return `${name}(${subject.trim()})`;
			});
		}

		total += passCount;
		if (passCount === 0) break;
	}

	return { text, count: total };
}

const files = walk(root);
let changedFiles = 0;
let totalRewrites = 0;

for (const path of files) {
	const original = await readFile(path, 'utf8');

	// Filters only ever appear in the template; splitting keeps script-block `|` untouched.
	// Greedy on the body: v11 nests `<template v-if>` inside, and stopping at the first closing tag
	// would silently hide every filter below it.
	const match = original.match(/^([\s\S]*?<template>)([\s\S]*)(<\/template>[\s\S]*)$/);
	if (match == null) continue;

	const [, head, template, tail] = match;
	const { text, count } = rewriteFilters(template);
	if (count === 0) continue;

	changedFiles++;
	totalRewrites += count;
	if (!dryRun) await writeFile(path, head + text + tail, 'utf8');
}

console.log(`${dryRun ? '[dry run] ' : ''}${totalRewrites} filter expressions rewritten across ${changedFiles} files`);

// Anything still matching means the pattern above did not fit and needs a person.
let leftover = 0;
for (const path of files) {
	const text = await readFile(path, 'utf8');
	const match = text.match(/^[\s\S]*?<template>([\s\S]*?)<\/template>/);
	if (match == null) continue;
	for (const name of FILTERS) {
		const hits = match[1].match(new RegExp(`\\|\\s*${name}\\b`, 'g'));
		if (hits) {
			leftover += hits.length;
			console.log(`  leftover: ${path.slice(root.length + 1)} -> | ${name} x${hits.length}`);
		}
	}
}
if (leftover === 0) console.log('no filter syntax remains in any template');
