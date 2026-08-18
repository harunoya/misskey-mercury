/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { host } from '@@/js/config.js';
import { PREF_DEF } from '@/preferences/def.js';
import { mergeProfiles, PreferencesManager } from '@/preferences/manager.js';
import type { PossiblyNonNormalizedPreferencesProfile } from '@/preferences/manager.js';

function createProfile(id: string): PossiblyNonNormalizedPreferencesProfile {
	const preferences: PossiblyNonNormalizedPreferencesProfile['preferences'] = {};
	for (const key of Object.keys(PREF_DEF)) {
		preferences[key] = [[{}, `value:${key}`, {}]];
	}

	return {
		id,
		version: 'test',
		type: 'main',
		modifiedAt: 1,
		name: 'test',
		preferences,
	};
}

function createManager(profile: PossiblyNonNormalizedPreferencesProfile, cloudValues: Record<string, unknown> = {}) {
	return new PreferencesManager({
		load: () => structuredClone(profile),
		save: () => {},
		cloudGetBulk: async () => cloudValues as any,
		cloudGet: async () => null,
		cloudSet: async () => {},
	}, { id: 'user' });
}

describe('mergeProfiles', () => {
	test('片方にない既知キーを許容し、未知の設定キーも保持する', () => {
		const local = createProfile('local');
		const cloud = createProfile('cloud');
		delete cloud.preferences.accounts;
		cloud.preferences['future.preference'] = [[{}, 'future', { modifiedAt: 2 }]];

		const merged = mergeProfiles(local as any, cloud as any) as PossiblyNonNormalizedPreferencesProfile;

		assert.deepStrictEqual(merged.preferences.accounts, local.preferences.accounts);
		assert.deepStrictEqual(merged.preferences['future.preference'], cloud.preferences['future.preference']);
	});

	test('新しい tombstone がアカウント上書きを無効化する', () => {
		const local = createProfile('local');
		local.preferences.accounts = [
			[{}, 'global', { modifiedAt: 1 }],
			[{ server: host, account: 'user' }, 'account', { modifiedAt: 1 }],
		];
		const cloud = createProfile('cloud');
		cloud.preferences.accounts = [
			[{}, 'global', { modifiedAt: 1 }],
			[{ server: host, account: 'user' }, 'account', { modifiedAt: 2, deleted: true } as any],
		];

		const merged = mergeProfiles(local as any, cloud as any);
		const manager = createManager(merged);

		assert.strictEqual(manager.getMatchedRecordOf('accounts')[1], 'global');
	});
});

describe('PreferencesManager account overrides', () => {
	test('アカウント上書きの解除を tombstone として保存する', () => {
		const profile = createProfile('local');
		profile.preferences.accounts = [
			[{}, 'global', { modifiedAt: 1 }],
			[{ server: host, account: 'user' }, 'account', { modifiedAt: 1 }],
		];
		const manager = createManager(profile);

		manager.clearAccountOverride('accounts');

		const deletedRecord = manager.profile.preferences.accounts.find(([scope]) => scope.server === host && scope.account === 'user');
		assert.strictEqual((deletedRecord?.[2] as any).deleted, true);
		assert.strictEqual(manager.getMatchedRecordOf('accounts')[1], 'global');
	});

	test('アカウント上書きの再有効化では tombstone を復活させる', () => {
		const profile = createProfile('local');
		profile.preferences.accounts = [
			[{}, 'global', { modifiedAt: 1 }],
			[{ server: host, account: 'user' }, 'old account', { modifiedAt: 2, deleted: true } as any],
		];
		const manager = createManager(profile);

		manager.setAccountOverride('accounts');

		const accountRecords = manager.profile.preferences.accounts.filter(([scope]) => scope.server === host && scope.account === 'user');
		assert.strictEqual(accountRecords.length, 1);
		assert.notStrictEqual((accountRecords[0][2] as any).deleted, true);
		assert.strictEqual(accountRecords[0][1], 'global');
	});
});

describe('PreferencesManager cloud values', () => {
	test('旧形式の metadata がないクラウド値も取得できる', async () => {
		const profile = createProfile('local');
		profile.preferences.accounts = [[{}, 'local', { sync: true, modifiedAt: 1 }]];
		const manager = createManager(profile, {
			accounts: {
				value: 'remote',
				meta: undefined,
			},
		});

		await manager.cloudReady;
		assert.strictEqual(manager.s.accounts, 'remote');
	});
});

describe('PreferencesManager profile normalization', () => {
	test('未知の設定キーを正規化後も保持する', () => {
		const profile = createProfile('local');
		profile.preferences['future.preference'] = [[{}, 'future', { modifiedAt: 2 }]];

		const manager = createManager(profile);

		assert.deepStrictEqual((manager.profile.preferences as any)['future.preference'], profile.preferences['future.preference']);
	});
});
