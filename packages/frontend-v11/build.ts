/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

await execa('node', ['scripts/verify-upstream.mjs'], {
	cwd: fileURLToPath(new URL('.', import.meta.url)),
	stdio: 'inherit',
});
await execa('webpack', ['--config', 'webpack.config.mjs', '--mode', 'production'], {
	cwd: fileURLToPath(new URL('.', import.meta.url)),
	stdio: 'inherit',
});
