/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const controlId = 'mercury-v11-recovery';
import { setUnscopedItem } from './storage.js';

export function installRecoveryControl(showFailure = false): void {
	const ensure = () => {
		if (document.getElementById(controlId)) return;
		const link = document.createElement('a');
		link.id = controlId;
		link.href = '/?ui=default';
		link.textContent = showFailure ? '現行UIへ戻る（起動エラー）' : '現行UIへ戻る';
		link.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:8px 12px;border-radius:4px;background:#313a42;color:#fff;font:13px sans-serif;text-decoration:none;box-shadow:0 2px 8px #0006';
		link.addEventListener('click', () => setUnscopedItem('ui', 'default'));
		document.body.appendChild(link);
	};
	ensure();
	window.setInterval(ensure, 1000);
}
