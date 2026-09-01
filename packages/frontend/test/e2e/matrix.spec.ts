/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from './fixtures.js';
import { registerUser, resetState, visitHome, closeUserSetupDialog, signIn } from './utils.js';

test.describe('Matrix chat', () => {
	test.beforeEach(async () => {
		await resetState();
		await registerUser('admin', 'pass', true);
		await registerUser('alice', 'alice1234');
	});

	test('does not download Matrix WASM until a Matrix session exists', async ({ page }) => {
		const wasmRequests: string[] = [];
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('matrix-sdk-crypto-wasm') || url.includes('.wasm')) wasmRequests.push(url);
		});

		await visitHome(page);
		await signIn(page, 'alice', 'alice1234');
		await closeUserSetupDialog(page);
		await page.goto('/chat');
		await page.getByText('History').or(page.getByText('履歴')).waitFor({ timeout: 15000 }).catch(() => undefined);
		await page.waitForTimeout(2000);

		test.expect(wasmRequests.filter(url => url.includes('matrix-sdk-crypto-wasm'))).toEqual([]);
	});

	test('keeps Misskey DM history on the same page as Matrix', async ({ page }) => {
		await visitHome(page);
		await signIn(page, 'alice', 'alice1234');
		await closeUserSetupDialog(page);
		await page.goto('/chat');
		await test.expect(page.getByRole('button', { name: /start chat|チャットを開始/i }).or(page.locator('text=Matrix'))).toBeVisible({ timeout: 15000 });
	});
});
