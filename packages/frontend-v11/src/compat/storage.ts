/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const prefix = 'mercury:v11:';
const unscopedGetItem = localStorage.getItem.bind(localStorage);
const unscopedSetItem = localStorage.setItem.bind(localStorage);
const unscopedRemoveItem = localStorage.removeItem.bind(localStorage);

export function setUnscopedItem(key: string, value: string): void {
	unscopedSetItem(key, value);
}

export function getUnscopedItem(key: string): string | null {
	return unscopedGetItem(key);
}

export function installNamespacedStorage(storage: Storage): Storage {
	Object.defineProperties(storage, {
		getItem: { value: (key: string) => unscopedGetItem(prefix + key) },
		setItem: { value: (key: string, value: string) => unscopedSetItem(prefix + key, value) },
		removeItem: { value: (key: string) => unscopedRemoveItem(prefix + key) },
	});

	return storage;
}
