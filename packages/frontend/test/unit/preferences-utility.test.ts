/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, test, vi } from 'vitest';
import { nextTick } from 'vue';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	confirm: vi.fn(async () => ({ canceled: false })),
	storeSet: vi.fn(),
	reloadProfile: vi.fn(),
}));

vi.mock('@/i.js', () => ({
	$i: {
		createdAt: new Date().toISOString(),
	},
}));

vi.mock('@/preferences.js', () => ({
	prefer: {
		profile: {
			id: 'local',
			version: 'test',
			type: 'main',
			modifiedAt: 1,
			name: 'test',
			preferences: {},
		},
		s: {
			devMode: false,
		},
		renameProfile: vi.fn(),
		reloadProfile: mocks.reloadProfile,
	},
}));

vi.mock('@/store.js', () => ({
	store: {
		s: {
			enablePreferencesAutoCloudBackup: true,
			enablePreferencesAutoCloudSync: false,
			latestPreferencesBackupAt: 0,
		},
		set: mocks.storeSet,
	},
}));

vi.mock('@/os.js', () => ({
	alert: vi.fn(),
	confirm: mocks.confirm,
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: mocks.api,
}));

vi.mock('@/utility/unison-reload.js', () => ({
	unisonReload: vi.fn(),
}));

describe('getPreferencesProfileMenu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('自動同期を有効化した直後にクラウド同期を行う', async () => {
		mocks.api.mockResolvedValue({
			id: 'cloud',
			version: 'test',
			type: 'main',
			modifiedAt: 2,
			name: 'test',
			preferences: {},
		});
		const { getPreferencesProfileMenu } = await import('@/preferences/utility.js');
		const menu = getPreferencesProfileMenu();
		const backupAndSync = menu.find((item) => item.type === 'parent') as any;
		const autoSync = backupAndSync.children.find((item: any) => item.type === 'switch' && item.icon === 'ti ti-cloud-down');

		autoSync.ref.value = true;
		await nextTick();
		await Promise.resolve();

		assert.strictEqual(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/registry/get'), true);
	});

	test('有効化直後の同期に失敗した場合は自動同期を無効に戻す', async () => {
		mocks.api.mockRejectedValue(new Error('network error'));
		const { getPreferencesProfileMenu } = await import('@/preferences/utility.js');
		const menu = getPreferencesProfileMenu();
		const backupAndSync = menu.find((item) => item.type === 'parent') as any;
		const autoSync = backupAndSync.children.find((item: any) => item.type === 'switch' && item.icon === 'ti ti-cloud-down');

		autoSync.ref.value = true;
		await nextTick();
		await vi.waitFor(() => {
			assert.strictEqual(autoSync.ref.value, false);
			assert.strictEqual(mocks.storeSet.mock.calls.some(([key, value]) => key === 'enablePreferencesAutoCloudSync' && value === false), true);
		});
	});
});
