/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Captures reference screenshots of the working v11 client.
//
// The vendored snapshot is verified byte-for-byte against upstream today, which is what proves the
// port is faithful. A Vue 3 rewrite ends that: the only remaining way to tell "still v11" from
// "something that resembles v11" is to compare what it draws. So take the pictures while the
// original still runs, and diff against them afterwards.
//
//   node scripts/capture-baseline.mjs [--url http://localhost:3100] [--out baseline]

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index === -1 ? fallback : args[index + 1];
};

const origin = readArg('url', 'http://localhost:3100');
const outDir = resolve(process.cwd(), readArg('out', 'baseline'));
const token = process.env.V11_BASELINE_TOKEN;

if (!token) {
	console.error('Set V11_BASELINE_TOKEN to an access token for the instance being captured.');
	process.exit(1);
}

const me = await fetch(`${origin}/api/i`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ i: token }),
}).then(res => res.json());

if (me.id == null) {
	console.error(`Could not sign in with V11_BASELINE_TOKEN: ${JSON.stringify(me)}`);
	process.exit(1);
}

const storedAccount = JSON.stringify({ ...me, token });

// Both layouts matter: v11 picks desktop or mobile at boot and they are separate component trees.
const viewports = [
	{ name: 'desktop', width: 1280, height: 900 },
	{ name: 'mobile', width: 390, height: 844 },
];

const routes = [
	{ name: 'home', path: '/' },
	{ name: 'notifications', path: '/i/notifications' },
	{ name: 'favorites', path: '/i/favorites' },
	{ name: 'drive', path: '/i/drive' },
	{ name: 'settings', path: '/i/settings' },
	{ name: 'explore', path: '/explore' },
	{ name: 'featured', path: '/featured' },
	{ name: 'user', path: '/@testing' },
	{ name: 'not-found', path: '/no-such-page' },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const captured = [];

try {
	for (const viewport of viewports) {
		const context = await browser.newContext({
			viewport: { width: viewport.width, height: viewport.height },
			deviceScaleFactor: 1,
		});

		// v11 reads the session from Mercury's own `account` entry, before it namespaces storage.
		// The whole account has to be there, not just the token: v11 is a UI style of the current
		// client now, so that client boots first and reads `$i.policies` on the way.
		await context.addInitScript(([storedAccount]) => {
			try {
				window.localStorage.setItem('account', storedAccount);
				window.localStorage.setItem('ui', 'v11');
			} catch {
				// A storage-less context simply captures the signed-out screens.
			}
		}, [storedAccount]);

		const page = await context.newPage();

		// Every route below is a real URL now that both clients share one space, but loading each
		// one fresh would re-boot the client nine times. Navigating through the router matches what
		// a user clicking around sees, and is what the captures are meant to compare.
		await page.goto(`${origin}/`, { waitUntil: 'networkidle' });

		// v11 is one of the current client's UI styles: that client boots first and only then
		// loads the v11 bundle, so the router appears a little after the page settles.
		await page.waitForFunction(() => {
			const app = document.querySelector('#app');
			return app?._vnode?.component?.proxy?.$router != null;
		}, null, { timeout: 60000 }).catch(() => undefined);
		await page.waitForTimeout(3000);

		for (const route of routes) {
			const navigated = await page.evaluate(async (target) => {
				// Vue 3 exposes the mounted root on the container's vnode, not on `__vue__`.
				const app = document.querySelector('#app');
				const router = app?._vnode?.component?.proxy?.$router;
				if (router == null) return false;
				await router.push(target).catch(() => undefined);
				return true;
			}, route.path);

			if (!navigated) {
				console.warn(`skipped ${viewport.name} ${route.path} (router unavailable)`);
				continue;
			}

			// v11 renders asynchronously and animates in; settle before the shutter.
			await page.waitForTimeout(2500);
			const file = resolve(outDir, `${viewport.name}-${route.name}.png`);
			await page.screenshot({ path: file, fullPage: true });
			captured.push(`${viewport.name}/${route.name}`);
			console.log(`captured ${viewport.name} ${route.path}`);
		}

		await context.close();
	}

	await writeFile(
		resolve(outDir, 'manifest.json'),
		`${JSON.stringify({ origin, capturedAt: new Date().toISOString(), shots: captured }, null, '\t')}\n`,
		'utf8',
	);
	console.log(`\n${captured.length} screenshots written to ${outDir}`);
} finally {
	await browser.close();
}
