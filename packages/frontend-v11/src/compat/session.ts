/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getUnscopedItem, setUnscopedItem } from './storage.js';

/**
 * CURRENT_SERVER_INTEGRATION
 *
 * The v11 UI is only offered to signed-in users, reached through the current UI's "UIを切り替え"
 * menu. Mercury keeps the session in the unscoped `account` entry, so it has to be read before
 * {@link installNamespacedStorage} rewrites `localStorage`.
 */
export function readMercuryToken(): string | null {
	const raw = getUnscopedItem('account');
	if (raw == null) return null;

	try {
		const account = JSON.parse(raw) as { token?: unknown };
		return typeof account.token === 'string' && account.token.length > 0 ? account.token : null;
	} catch {
		return null;
	}
}

/**
 * Hands the visitor back to the UI they came from. `ui` has to be cleared first: main-boot sends
 * every `ui === 'v11'` visit straight back to `/v11/`, so leaving it set would bounce the two
 * boot scripts against each other forever.
 */
export function leaveToCurrentUi(): void {
	const returnUi = window.sessionStorage.getItem('mercury:v11:return-ui');
	setUnscopedItem('ui', returnUi === 'deck' ? 'deck' : 'default');
	window.location.replace('/');
}
