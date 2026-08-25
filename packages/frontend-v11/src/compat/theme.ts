/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * BUILD_COMPAT
 *
 * Upstream boots through `src/client/app/boot.js`, which paints the persisted theme onto
 * `documentElement` before the app script runs. This package replaces that loader (it resolved
 * `/assets/{app}.{version}.js` by hand and fetched locales over HTTP), so the same step has to
 * happen here — `init.ts` only calls `applyTheme` when no theme has been stored yet, which means
 * every later visit would otherwise start with unset `--*` variables and render transparent
 * surfaces over the timeline.
 *
 * Kept deliberately identical to the upstream loop.
 */
export function applyPersistedTheme(storage: Storage): void {
	const theme = storage.getItem('theme');
	if (!theme) return;

	try {
		for (const [k, v] of Object.entries(JSON.parse(theme) as Record<string, unknown>)) {
			document.documentElement.style.setProperty(`--${k}`, String(v));
		}
	} catch {
		// A corrupt entry must not stop boot; init.ts re-applies the default theme once it is gone.
		storage.removeItem('theme');
	}
}
