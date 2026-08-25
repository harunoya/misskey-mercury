/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = resolve(packageRoot, 'vendor/misskey-11.37.1/src/client');

function filesBelow(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory() ? filesBelow(path) : [path];
	});
}

const vueFiles = filesBelow(clientRoot)
	.filter((path) => path.endsWith('.vue'))
	.sort((a, b) => a.localeCompare(b, 'en'));

const aggregate = createHash('sha256');
for (const path of vueFiles) {
	const name = relative(clientRoot, path).replaceAll('\\', '/');
	const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
	aggregate.update(`${name}\0${digest}\n`);
}

const actual = aggregate.digest('hex');
const expected = readFileSync(resolve(packageRoot, 'upstream-vue-components.sha256'), 'utf8').trim();

if (actual !== expected) {
	console.error(`Upstream Vue snapshot mismatch: expected ${expected}, got ${actual}`);
	process.exitCode = 1;
} else {
	console.log(`Upstream Vue snapshot OK: ${vueFiles.length} files, ${actual}`);
}
