/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { installApiCompatibility } from './compat/api.js';
import { installRecoveryControl } from './compat/recovery.js';
import { installNamespacedStorage } from './compat/storage.js';
import { leaveToCurrentUi, readMercuryToken } from './compat/session.js';
import { applyPersistedTheme } from './compat/theme.js';
import 'katex/dist/katex.min.css';

// Must be read before the namespaced storage is installed: `account` is Mercury's own key.
const token = readMercuryToken();

// The v11 UI is a signed-in-only alternative to the current UI, so a visitor without a session is
// handed straight back rather than shown v11's own guest screens.
if (token == null) {
	leaveToCurrentUi();
} else {
	const storage = installNamespacedStorage(localStorage);

	storage.setItem('lang', 'ja-JP');
	storage.setItem('locale', JSON.stringify(_V11_LOCALE_));
	storage.setItem('localeKey', '11.37.1.ja-JP');
	storage.setItem('i', token);

	applyPersistedTheme(storage);

	installApiCompatibility();
	installRecoveryControl();

	const mobile = /mobile|iphone|ipad|android/i.test(navigator.userAgent) || window.innerWidth < 576;

	try {
		if (mobile) {
			await import('../vendor/misskey-11.37.1/src/client/app/mobile/script.js');
		} else {
			await import('../vendor/misskey-11.37.1/src/client/app/desktop/script.js');
		}
	} catch (error) {
		console.error('[frontend-v11] boot failed', error);
		installRecoveryControl(true);
	}
}
