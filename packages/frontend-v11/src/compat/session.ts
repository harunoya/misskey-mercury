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

/** The UI styles a reader can move between. `v11` is the one this build serves. */
export type UiStyle = 'default' | 'deck' | 'v11';

/** Which style the reader came from, so leaving v11 returns them there rather than to a guess. */
export function previousUi(): UiStyle {
	const saved = getUnscopedItem('mercury:v11:previousUi');
	return saved === 'deck' ? 'deck' : 'default';
}

/**
 * Moves the reader to another UI style, on the page they are already on.
 *
 * The switch is made the way the current client's menu makes it — write `ui`, reload — so the URL
 * never carries a marker for which client is showing.
 */
export function switchUi(style: UiStyle): void {
	setUnscopedItem('ui', style);
	window.location.reload();
}

/**
 * Hands the reader back to the client they came from.
 *
 * The value comes from what they were using before v11, not a hardcoded `default`, or picking v11
 * from a deck would quietly demote them to the default UI.
 */
export function leaveToCurrentUi(): void {
	switchUi(previousUi());
}
