/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import { passwordSchema } from '@/models/User.js';
import { LinkedAccountService } from '@/core/LinkedAccountService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	kind: 'write:account',
	// パスワード設定を伴う操作なので、OAuthアプリトークン経由の呼び出しは許可しない
	secure: true,

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
		},
		notYourSubAccount: {
			message: 'The specified account is not one of your linked sub accounts.',
			code: 'NOT_YOUR_SUB_ACCOUNT',
			id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
		},
		notLinked: {
			message: 'Your account is not linked to a main account.',
			code: 'NOT_LINKED',
			id: '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f',
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
		// 省略時: 自分自身の関連付けを解除する (自分がサブアカウントである場合のみ)
		// 指定時: 自分 (メインアカウント) に関連付けられている、指定したサブアカウントの関連付けを解除する
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		newPassword: passwordSchema,
	},
	required: ['newPassword'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private linkedAccountService: LinkedAccountService,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const target = await (async () => {
				if (ps.userId == null) {
					if (me.linkedToUserId == null) {
						throw new ApiError(meta.errors.notLinked);
					}
					return me;
				}

				const user = await this.usersRepository.findOneBy({ id: ps.userId });
				if (user == null) {
					throw new ApiError(meta.errors.noSuchUser);
				}
				if (user.linkedToUserId !== me.id) {
					throw new ApiError(meta.errors.notYourSubAccount);
				}
				return user;
			})();

			const salt = await bcrypt.genSalt(8);
			const hash = await bcrypt.hash(ps.newPassword, salt);

			await this.linkedAccountService.unlink(target, hash);

			const updated = await this.usersRepository.findOneByOrFail({ id: target.id });
			return await this.userEntityService.pack(updated, me, { schema: 'UserLite' });
		});
	}
}
