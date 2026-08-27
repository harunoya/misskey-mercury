/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { LinkedAccountService } from '@/core/LinkedAccountService.js';
import { DI } from '@/di-symbols.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { verifyPassword } from '@/misc/password.js';

export const meta = {
	requireCredential: true,

	secure: true,

	errors: {
		// 関連アカウント機能: サブアカウントが残っている状態でメインアカウントを削除すると、
		// パスワードを持たないサブアカウントがロックアウトされてしまうため先に解除させる。
		hasLinkedSubAccounts: {
			message: 'This account still has linked sub accounts. Unlink them before deleting this account.',
			code: 'HAS_LINKED_SUB_ACCOUNTS',
			id: 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		password: { type: 'string' },
		token: { type: 'string', nullable: true },
	},
	required: ['password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userAuthService: UserAuthService,
		private deleteAccountService: DeleteAccountService,
		private linkedAccountService: LinkedAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (await this.linkedAccountService.hasLinkedSubAccounts(me.id)) {
				throw new ApiError(meta.errors.hasLinkedSubAccounts);
			}

			const token = ps.token;
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			if (profile.twoFactorEnabled) {
				if (token == null) {
					throw new Error('authentication failed');
				}

				try {
					await this.userAuthService.twoFactorAuthenticate(profile, token);
				} catch (_) {
					throw new Error('authentication failed');
				}
			}

			const userDetailed = await this.usersRepository.findOneByOrFail({ id: me.id });
			if (userDetailed.isDeleted) {
				return;
			}

			const passwordMatched = await verifyPassword(ps.password, profile.password!);
			if (!passwordMatched) {
				throw new Error('incorrect password');
			}

			await this.deleteAccountService.deleteAccount(me);
		});
	}
}
