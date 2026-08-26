/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as JSON5 from 'json5';
import type { App } from 'vue';
import getAcct from '../../vendor/misskey-11.37.1/src/misc/acct/render';
import getUserName from '../../vendor/misskey-11.37.1/src/misc/get-user-name';
import { url } from '../../vendor/misskey-11.37.1/src/client/app/config';
import { sanitizeHtml } from './sanitize-html';

/**
 * v11's template filters, as plain functions.
 *
 * Vue 3 removed filters, and removed them quietly: `note | notePage` still parses as a bitwise OR,
 * so the templates were rewritten to call these directly. Registering them as global properties
 * keeps that rewrite to a one-word change per site instead of an import in all fifty files.
 *
 * The bodies are unchanged from `app/common/views/filters/`.
 */
export const filters = {
	acct: (user: unknown) => getAcct(user as never),

	userName: (user: unknown) => getUserName(user as never),

	userPage: (user: unknown, path?: string | null, absolute = false) =>
		`${absolute ? url : ''}/@${getAcct(user as never)}${path ? `/${path}` : ''}`,

	notePage: (note: { id: string }) => `/notes/${note.id}`,

	number: (n: number | null | undefined) => (n == null ? 'N/A' : n.toLocaleString()),

	json5: (x: unknown) => JSON5.stringify(x, null, 2),

	sanitizeHtml,

	bytes: (v: number | null | undefined, digits = 0) => {
		if (v == null) return '?';
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
		if (v === 0) return '0';
		const isMinus = v < 0;
		const value = isMinus ? -v : v;
		const i = Math.floor(Math.log(value) / Math.log(1024));
		return (isMinus ? '-' : '') + (value / Math.pow(1024, i)).toFixed(digits).replace(/\.0+$/, '') + sizes[i];
	},
};

export function installFilters(app: App): void {
	Object.assign(app.config.globalProperties, filters);
}
