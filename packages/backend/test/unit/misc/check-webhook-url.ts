/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { isSafeWebhookUrl } from '@/misc/check-webhook-url.js';

describe('isSafeWebhookUrl', () => {
	const previousNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		process.env.NODE_ENV = previousNodeEnv;
	});

	test('accepts https URLs', () => {
		expect(isSafeWebhookUrl('https://example.com/hook')).toBe(true);
	});

	test('rejects non-http(s) schemes', () => {
		expect(isSafeWebhookUrl('file:///etc/passwd')).toBe(false);
		expect(isSafeWebhookUrl('ftp://example.com/hook')).toBe(false);
		expect(isSafeWebhookUrl('javascript:alert(1)')).toBe(false);
	});

	test('rejects URLs with credentials', () => {
		expect(isSafeWebhookUrl('https://user:pass@example.com/hook')).toBe(false);
	});

	test('rejects invalid URLs', () => {
		expect(isSafeWebhookUrl('not a url')).toBe(false);
		expect(isSafeWebhookUrl('')).toBe(false);
	});

	test('always rejects link-local and metadata addresses', () => {
		process.env.NODE_ENV = 'test';
		expect(isSafeWebhookUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
		expect(isSafeWebhookUrl('http://metadata.google.internal/')).toBe(false);
	});

	test('allows localhost in the test environment', () => {
		process.env.NODE_ENV = 'test';
		expect(isSafeWebhookUrl('http://localhost:15080')).toBe(true);
		expect(isSafeWebhookUrl('http://127.0.0.1:15080/hook')).toBe(true);
	});

	test('rejects private and loopback hosts outside the test environment', () => {
		process.env.NODE_ENV = 'production';
		expect(isSafeWebhookUrl('http://localhost:15080')).toBe(false);
		expect(isSafeWebhookUrl('http://127.0.0.1/hook')).toBe(false);
		expect(isSafeWebhookUrl('http://192.168.1.10/hook')).toBe(false);
		expect(isSafeWebhookUrl('http://10.0.0.5/hook')).toBe(false);
		expect(isSafeWebhookUrl('https://example.com/hook')).toBe(true);
	});
});
