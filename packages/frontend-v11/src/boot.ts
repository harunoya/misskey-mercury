/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { installRecoveryControl } from './compat/recovery.js';
import { installNamespacedStorage } from './compat/storage.js';
import { leaveToCurrentUi, readMercuryToken } from './compat/session.js';
import { applyPersistedTheme } from './compat/theme.js';
import 'katex/dist/katex.min.css';
// Must come after the current client's stylesheet, which injecting at runtime guarantees.
import './compat/host-document.css';

/**
 * Clears the current client's splash.
 *
 * v11 is one of the current client's UI styles, so this bundle loads into a document that is
 * already open and already showing that splash. Upstream `init.ts` rebuilds `document.body` for
 * its own mount point a moment later, which takes the splash with it — but not before it has been
 * visible on top of v11's first paint.
 */
function hideCurrentUiSplash(): void {
	document.getElementById('splash')?.remove();
}

// Must be read before the namespaced storage is installed: `account` is Mercury's own key.
const token = readMercuryToken();

// The v11 UI is a signed-in-only alternative to the current UI, so a visitor without a session is
// handed straight back rather than shown v11's own guest screens.
if (token == null) {
	leaveToCurrentUi();
} else {
	hideCurrentUiSplash();

	const storage = installNamespacedStorage(localStorage);

	storage.setItem('lang', 'ja-JP');
	storage.setItem('locale', JSON.stringify(_V11_LOCALE_));
	storage.setItem('localeKey', '11.37.1.ja-JP');
	storage.setItem('i', token);

	applyPersistedTheme(storage);

	installRecoveryControl();

	const mobile = /mobile|iphone|ipad|android/i.test(navigator.userAgent) || window.innerWidth < 576;
	const admin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

	try {
		if (admin) {
			await import('../vendor/misskey-11.37.1/src/client/app/admin/script.js');
		} else if (mobile) {
			await import('../vendor/misskey-11.37.1/src/client/app/mobile/script.js');
		} else {
			await import('../vendor/misskey-11.37.1/src/client/app/desktop/script.js');
		}
	} catch (error) {
		console.error('[frontend-v11] boot failed', error);
		installRecoveryControl(true);
	}
}
