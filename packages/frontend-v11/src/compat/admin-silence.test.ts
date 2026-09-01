/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest';
import { silenceCurrentUser, unsilenceCurrentUser } from './admin-silence.js';

describe('current role-based silence adapter', () => {
	it('creates and assigns an explicit current-backend role', async () => {
		let assigned = false;
		const api = vi.fn(async (endpoint: string, data?: Record<string, unknown>) => {
			if (endpoint === 'admin/roles/list') return [];
			if (endpoint === 'admin/roles/create') {
				expect(data?.policies).toEqual({
					canPublicNote: { useDefault: false, priority: 2, value: false },
				});
				return { id: 'silence-role', ...data };
			}
			if (endpoint === 'admin/roles/assign') {
				expect(data).toEqual({ roleId: 'silence-role', userId: 'user', expiresAt: null });
				assigned = true;
				return null;
			}
			if (endpoint === 'admin/show-user') return { isSilenced: assigned };
			throw new Error(`unexpected endpoint ${endpoint}`);
		});

		await silenceCurrentUser({ api }, 'user');
		expect(assigned).toBe(true);
	});

	it('never removes an unrelated role while unsilencing', async () => {
		const unrelated = {
			id: 'unrelated',
			description: 'another role',
			target: 'manual',
			policies: { canPublicNote: { useDefault: false, priority: 2, value: false } },
		};
		const api = vi.fn(async (endpoint: string) => {
			if (endpoint === 'admin/roles/list') return [unrelated];
			if (endpoint === 'admin/show-user') return { isSilenced: true, roleAssigns: [{ roleId: unrelated.id }] };
			throw new Error(`unexpected endpoint ${endpoint}`);
		});

		await expect(unsilenceCurrentUser({ api }, 'user')).rejects.toThrow('another current-backend role');
		expect(api).not.toHaveBeenCalledWith('admin/roles/unassign', expect.anything());
	});
});
