/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import sanitizeHtmlLib from 'sanitize-html';

/**
 * Allowlist for instance description / server rules. Scripts, event handlers,
 * javascript: URLs, and other active content are stripped. Keep in sync with
 * `packages/frontend/src/utility/sanitize-html.ts`.
 */
const OPTIONS: sanitizeHtmlLib.IOptions = {
	allowedTags: [...sanitizeHtmlLib.defaults.allowedTags, 'img'],
	allowedAttributes: {
		...sanitizeHtmlLib.defaults.allowedAttributes,
		img: ['src', 'alt', 'title', 'width', 'height'],
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	allowProtocolRelative: false,
};

export function sanitizeInstanceHtml(dirty: string | null | undefined): string {
	if (dirty == null || dirty === '') return '';
	return sanitizeHtmlLib(dirty, OPTIONS);
}
