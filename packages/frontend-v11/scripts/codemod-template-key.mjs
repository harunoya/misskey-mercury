/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Moves `:key` from the children of a `<template v-for>` onto the template itself.
//
// Vue 2 accepted the key on each child; Vue 3 rejects it outright — "key should be placed on the
// <template> tag" — because the template is the thing being repeated. Where several children share
// one iteration the first child's key is the one that identifies it, so that is the one hoisted.
//
//   node scripts/codemod-template-key.mjs [--dry]

import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dryRun = process.argv.includes('--dry');
const root = resolve(process.cwd(), 'vendor/misskey-11.37.1/src/client');

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...walk(path));
		else if (entry.endsWith('.vue')) out.push(path);
	}
	return out;
}

const OPEN = /<template\b([^>]*\bv-for=(?:"[^"]*"|'[^']*')[^>]*)>/g;
const KEY = /\s(?::key|v-bind:key)=("[^"]*"|'[^']*')/;

/** Finds the `</template>` matching the tag that opens at `from`, allowing for nesting. */
function findClose(text, from) {
	let depth = 1;
	let index = from;
	while (depth > 0) {
		const open = text.indexOf('<template', index);
		const close = text.indexOf('</template>', index);
		if (close === -1) return -1;
		if (open !== -1 && open < close) {
			depth++;
			index = open + 9;
		} else {
			depth--;
			if (depth === 0) return close;
			index = close + 11;
		}
	}
	return -1;
}

const files = walk(root);
let changedFiles = 0;
let hoisted = 0;
let removed = 0;

for (const path of files) {
	const original = await readFile(path, 'utf8');
	let text = original;
	let changedHere = false;

	for (;;) {
		OPEN.lastIndex = 0;
		let match = null;
		while ((match = OPEN.exec(text)) !== null) {
			if (!KEY.test(match[1])) break;   // already keyed; leave it
			match = null;
		}
		if (match == null) break;

		const openStart = match.index;
		const openEnd = openStart + match[0].length;
		const closeStart = findClose(text, openEnd);
		if (closeStart === -1) break;

		const body = text.slice(openEnd, closeStart);
		const keyMatch = body.match(KEY);
		if (keyMatch == null) break;   // nothing to hoist; would loop forever otherwise

		const keyValue = keyMatch[1];
		const strippedBody = body.replace(new RegExp(KEY.source, 'g'), '');
		removed += (body.match(new RegExp(KEY.source, 'g')) ?? []).length;

		const openTag = `<template${match[1]} :key=${keyValue}>`;
		text = text.slice(0, openStart) + openTag + strippedBody + text.slice(closeStart);
		hoisted++;
		changedHere = true;
	}

	if (changedHere) {
		changedFiles++;
		if (!dryRun) await writeFile(path, text, 'utf8');
	}
}

console.log(`${dryRun ? '[dry run] ' : ''}hoisted ${hoisted} keys onto <template v-for> across ${changedFiles} files (${removed} child keys removed)`);
