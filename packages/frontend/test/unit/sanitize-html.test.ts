/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { sanitizeInstanceHtml } from '@/utility/sanitize-html.js';

describe('sanitizeInstanceHtml', () => {
	test('keeps basic formatting', () => {
		expect(sanitizeInstanceHtml('<p>hello <em>there</em></p>')).toBe('<p>hello <em>there</em></p>');
	});

	test('strips script tags', () => {
		const result = sanitizeInstanceHtml('<div>safe<script>alert(1)</script></div>');
		expect(result).not.toContain('script');
		expect(result).not.toContain('alert');
	});

	test('strips event handlers from server rules', () => {
		const result = sanitizeInstanceHtml('<li onerror="alert(1)">rule</li>');
		expect(result).not.toContain('onerror');
		expect(result).toContain('rule');
	});

	test('strips javascript hrefs', () => {
		const result = sanitizeInstanceHtml('<a href="javascript:alert(1)">click</a>');
		expect(result).not.toContain('javascript');
	});
});
