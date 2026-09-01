/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { previousUi, switchUi } from './session.js';
import type { UiStyle } from './session.js';

type DialogRoot = {
	dialog: (opts: Record<string, unknown>) => Promise<{ canceled: boolean; result?: unknown }>;
	$t: (key: string) => string;
};

/**
 * Asks which UI to show, and switches to it.
 *
 * v11 used to offer a single floating "back to the current UI" link, which could only ever go one
 * way: someone who reached v11 from the deck and wanted the default client had to leave, switch,
 * and come back. This is the same choice the current client's own menu presents, made with v11's
 * dialog so it looks like the rest of this client.
 */
export async function chooseUi(root: DialogRoot): Promise<void> {
	const current: UiStyle = 'v11';
	const items: { value: UiStyle; text: string }[] = [
		{ value: 'default', text: root.$t('@._switch-ui.default') },
		{ value: 'deck', text: root.$t('@._switch-ui.deck') },
		{ value: 'v11', text: root.$t('@._switch-ui.v11') },
	];

	const { canceled, result } = await root.dialog({
		title: root.$t('@.switch-ui'),
		text: root.$t('@._switch-ui.description'),
		select: {
			items,
			// Opens on what the reader would switch back to, since staying on v11 is what cancelling
			// already does.
			default: previousUi(),
		},
		showCancelButton: true,
	});

	if (canceled) return;
	const chosen = result as UiStyle;
	if (chosen == null || chosen === current) return;

	switchUi(chosen);
}
