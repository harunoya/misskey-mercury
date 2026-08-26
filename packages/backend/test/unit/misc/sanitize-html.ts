/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { sanitizeInstanceHtml } from '@/misc/sanitize-html.js';

describe('sanitizeInstanceHtml', () => {
	test('keeps basic formatting', () => {
		expect(sanitizeInstanceHtml('<p>hello <strong>world</strong></p>')).toBe('<p>hello <strong>world</strong></p>');
	});

	test('strips script tags', () => {
		const result = sanitizeInstanceHtml('<p>ok</p><script>alert(1)</script>');
		expect(result).toContain('<p>ok</p>');
		expect(result).not.toContain('script');
		expect(result).not.toContain('alert');
	});

	test('strips event handlers', () => {
		const result = sanitizeInstanceHtml('<p onclick="alert(1)">x</p>');
		expect(result).toBe('<p>x</p>');
	});

	test('strips javascript URLs', () => {
		const result = sanitizeInstanceHtml('<a href="javascript:alert(1)">x</a>');
		expect(result).not.toContain('javascript');
	});

	test('returns empty string for nullish input', () => {
		expect(sanitizeInstanceHtml(null)).toBe('');
		expect(sanitizeInstanceHtml(undefined)).toBe('');
	});
});
