/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

interface ApiRoot {
	api: (endpoint: string, data?: Record<string, unknown>) => Promise<any>;
	stream: {
		useSharedConnection: (channel: string) => {
			on: (event: string, listener: (value: any) => void) => void;
			off: (event: string, listener: (value: any) => void) => void;
			dispose: () => void;
		};
	};
}

export async function fetchAllCustomEmojis(root: ApiRoot): Promise<any[]> {
	const result: any[] = [];
	let untilId: string | undefined;

	for (;;) {
		const page = await root.api('admin/emoji/list', { limit: 100, untilId });
		result.push(...page);
		if (page.length < 100) return result;
		untilId = page.at(-1).id;
	}
}

/** Downloads an image through the current drive API and resolves when its stream event arrives. */
export function uploadEmojiSource(root: ApiRoot, url: string): Promise<{ id: string }> {
	const marker = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
	const connection = root.stream.useSharedConnection('main');

	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			connection.off('urlUploadFinished', onFinished);
			connection.dispose();
			callback();
		};
		const onFinished = (event: { marker?: string | null; file?: { id?: string } }) => {
			if (event.marker !== marker) return;
			if (typeof event.file?.id !== 'string') {
				finish(() => reject(new Error('The backend completed the URL upload without a drive file')));
				return;
			}
			finish(() => resolve({ id: event.file!.id! }));
		};
		const timeout = setTimeout(() => {
			finish(() => reject(new Error('Timed out while the backend downloaded the custom emoji')));
		}, 120_000);

		connection.on('urlUploadFinished', onFinished);
		root.api('drive/files/upload-from-url', { url, marker, force: true }).catch(error => {
			finish(() => reject(error));
		});
	});
}
