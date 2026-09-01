/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { compileMeilisearchValue } from '@/core/SearchService.js';

describe('compileMeilisearchValue', () => {
	test('escapes single quotes and backslashes', () => {
		expect(compileMeilisearchValue("x' OR userId = 'y")).toBe("'x\\' OR userId = \\'y'");
		expect(compileMeilisearchValue('c:\\Users')).toBe("'c:\\\\Users'");
	});

	test('passes numbers and booleans through', () => {
		expect(compileMeilisearchValue(12)).toBe('12');
		expect(compileMeilisearchValue(true)).toBe('true');
	});
});
