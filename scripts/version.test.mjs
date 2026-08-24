/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVersion } from './version.mjs';

test('returns the package version when no suffix is provided', () => {
	assert.equal(resolveVersion('2026.8.0-alpha.0', ''), '2026.8.0-alpha.0');
	assert.equal(resolveVersion('2026.8.0-alpha.0', '  '), '2026.8.0-alpha.0');
});

test('appends a normalized suffix without changing package.json', () => {
	assert.equal(resolveVersion('2026.8.0-alpha.0', 'mercury'), '2026.8.0-alpha.0-mercury');
	assert.equal(resolveVersion('2026.8.0-alpha.0', '-mercury'), '2026.8.0-alpha.0-mercury');
});

test('rejects suffixes that are unsafe for versions and filenames', () => {
	assert.throws(() => resolveVersion('2026.8.0-alpha.0', 'mercury preview'), /MISSKEY_VERSION_SUFFIX/);
	assert.throws(() => resolveVersion('2026.8.0-alpha.0', '../mercury'), /MISSKEY_VERSION_SUFFIX/);
});
