/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVersion } from './version.mjs';

test('includes the Mercury base version when no extra suffix is provided', () => {
	assert.equal(resolveVersion('2026.8.0-alpha.0', '0.1.0', ''), '2026.8.0-alpha.0-mercury.0.1.0');
	assert.equal(resolveVersion('2026.8.0-alpha.0', '0.1.0', '  '), '2026.8.0-alpha.0-mercury.0.1.0');
});

test('keeps the legacy mercury suffix compatible', () => {
	assert.equal(resolveVersion('2026.8.0-alpha.0', '0.1.0', 'mercury'), '2026.8.0-alpha.0-mercury.0.1.0');
	assert.equal(resolveVersion('2026.8.0-alpha.0', '0.1.0', '-mercury'), '2026.8.0-alpha.0-mercury.0.1.0');
});

test('appends an optional distribution suffix after the Mercury version', () => {
	assert.equal(resolveVersion('2026.8.0-alpha.0', '0.1.0', 'preview'), '2026.8.0-alpha.0-mercury.0.1.0.preview');
});

test('rejects versions and suffixes that are unsafe for versions and filenames', () => {
	assert.throws(() => resolveVersion('2026.8.0-alpha.0', 'mercury preview'), /mercuryVersion/);
	assert.throws(() => resolveVersion('2026.8.0-alpha.0', '../mercury'), /mercuryVersion/);
	assert.throws(() => resolveVersion('2026.8.0-alpha.0', '0.1.0', 'mercury preview'), /MISSKEY_VERSION_SUFFIX/);
	assert.throws(() => resolveVersion('2026.8.0-alpha.0', '0.1.0', '../mercury'), /MISSKEY_VERSION_SUFFIX/);
});
