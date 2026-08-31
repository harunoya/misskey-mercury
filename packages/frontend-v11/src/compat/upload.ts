/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface UploadOptions {
	file: Blob;
	name?: string;
	folderId?: string | null;
	isSensitive?: boolean;
	force?: boolean;
	onProgress?: (loaded: number, total: number) => void;
}

function currentToken(): string | null {
	try {
		const me = JSON.parse(localStorage.getItem('me') ?? 'null');
		if (typeof me?.token === 'string') return me.token;
	} catch {
		// The boot-time account token remains the source of truth when old persisted state is invalid.
	}
	return localStorage.getItem('i');
}

/** Uploads to the current backend without exposing a second legacy transport in components. */
export function uploadDriveFile(options: UploadOptions): Promise<any> {
	const form = new FormData();
	form.append('file', options.file, options.name ?? ('name' in options.file ? String(options.file.name) : 'upload'));
	const token = currentToken();
	if (token != null) form.append('i', token);
	if (options.folderId != null) form.append('folderId', options.folderId);
	if (options.isSensitive != null) form.append('isSensitive', String(options.isSensitive));
	if (options.force != null) form.append('force', String(options.force));

	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/drive/files/create', true);
		xhr.withCredentials = true;
		xhr.upload.onprogress = event => options.onProgress?.(event.loaded, event.total);
		xhr.onload = () => {
			let body: unknown = xhr.responseText;
			try {
				body = xhr.responseText === '' ? null : JSON.parse(xhr.responseText);
			} catch {
				// Preserve the response text for a useful error below.
			}
			if (xhr.status >= 200 && xhr.status < 300) resolve(body);
			else reject(new Error(typeof body === 'string' ? body : `Upload failed with status ${xhr.status}`));
		};
		xhr.onerror = () => reject(new Error('The drive upload request failed'));
		xhr.onabort = () => reject(new Error('The drive upload was aborted'));
		xhr.send(form);
	});
}
