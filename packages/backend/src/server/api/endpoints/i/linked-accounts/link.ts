/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { localUsernameSchema } from '@/models/User.js';
import { LinkedAccountService } from '@/core/LinkedAccountService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { verifyPassword } from '@/misc/password.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	kind: 'write:account',
	// パスワード所有権確認を伴う操作なので、OAuthアプリトークン経由の呼び出しは許可しない
	secure: true,

	errors: {
		alreadyLinked: {
			message: 'You are already linked to a main account, so you cannot have sub accounts.',
			code: 'ALREADY_LINKED',
			id: '9c3b9b2a-3b1a-4b7a-9c9a-4d6b9f1a2c3d',
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '2a1f9d7e-4b7a-4b1a-9c9a-4d6b9f1a2c4e',
		},
		cannotLinkSelf: {
			message: 'You cannot link your own account to itself.',
			code: 'CANNOT_LINK_SELF',
			id: '7e8f9d0a-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
		},
		targetAlreadyLinked: {
			message: 'The target account is already linked to another account.',
			code: 'TARGET_ALREADY_LINKED',
			id: '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6b',
		},
		targetHasSubAccounts: {
			message: 'The target account already has its own sub accounts, so it cannot become a sub account.',
			code: 'TARGET_HAS_SUB_ACCOUNTS',
			id: '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c',
		},
		incorrectPassword: {
			message: 'Incorrect password for the target account.',
			code: 'INCORRECT_PASSWORD',
			id: '8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'UserLite',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		username: localUsernameSchema,
		password: { type: 'string' },
	},
	required: ['username', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private linkedAccountService: LinkedAccountService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (me.linkedToUserId != null) {
				throw new ApiError(meta.errors.alreadyLinked);
			}

			const target = await this.usersRepository.findOneBy({
				usernameLower: ps.username.toLowerCase(),
				host: IsNull(),
			});

			if (target == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			if (target.id === me.id) {
				throw new ApiError(meta.errors.cannotLinkSelf);
			}

			if (target.linkedToUserId != null) {
				throw new ApiError(meta.errors.targetAlreadyLinked);
			}

			if (await this.linkedAccountService.hasLinkedSubAccounts(target.id)) {
				throw new ApiError(meta.errors.targetHasSubAccounts);
			}

			const targetProfile = await this.userProfilesRepository.findOneByOrFail({ userId: target.id });
			const passwordMatched = targetProfile.password != null && await verifyPassword(ps.password, targetProfile.password);
			if (!passwordMatched) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			await this.linkedAccountService.link(me, target);

			return await this.userEntityService.pack(target, me, { schema: 'UserLite' });
		});
	}
}
