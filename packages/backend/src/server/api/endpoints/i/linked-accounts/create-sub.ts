/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { localUsernameSchema } from '@/models/User.js';
import { SignupService } from '@/core/SignupService.js';
import { LinkedAccountService } from '@/core/LinkedAccountService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	kind: 'write:account',
	// アカウント作成を伴う操作なので、OAuthアプリトークン経由の呼び出しは許可しない
	secure: true,

	limit: {
		duration: 1000 * 60 * 60,
		max: 5,
	},

	errors: {
		alreadyLinked: {
			message: 'You are already linked to a main account, so you cannot have sub accounts.',
			code: 'ALREADY_LINKED',
			id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c6a',
		},
		duplicatedUsername: {
			message: 'Specified username already exists.',
			code: 'DUPLICATED_USERNAME',
			id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c6b7a',
		},
		invalidUsername: {
			message: 'Invalid username.',
			code: 'INVALID_USERNAME',
			id: 'c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c6b7c8a',
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
	},
	required: ['username'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private signupService: SignupService,
		private linkedAccountService: LinkedAccountService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (me.linkedToUserId != null) {
				throw new ApiError(meta.errors.alreadyLinked);
			}

			// サブアカウントは独自パスワードを持たない (認証は常にメインアカウントに委譲される)
			const { account } = await this.signupService.signup({
				username: ps.username,
				password: null,
				approved: true,
			}).catch(err => {
				if (err instanceof Error) {
					if (err.message === 'INVALID_USERNAME') throw new ApiError(meta.errors.invalidUsername);
					if (err.message === 'DUPLICATED_USERNAME' || err.message === 'USED_USERNAME') throw new ApiError(meta.errors.duplicatedUsername);
				}
				throw err;
			});

			await this.linkedAccountService.link(me, account);

			return await this.userEntityService.pack(account, me, { schema: 'UserLite' });
		});
	}
}
