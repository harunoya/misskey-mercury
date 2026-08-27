/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import { LinkedAccountService } from '@/core/LinkedAccountService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	kind: 'read:account',

	// ローカルにのみ意味のある関連付けなので連合には出さない (専用エンドポイントで自分だけが見る)
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			linkedTo: {
				type: 'object',
				optional: false, nullable: true,
				ref: 'UserLite',
			},
			subAccounts: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'UserLite',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
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
			const linkedTo = me.linkedToUserId == null
				? null
				: await this.usersRepository.findOneBy({ id: me.linkedToUserId });

			const subAccounts = await this.linkedAccountService.listSubAccounts(me.id);

			return {
				linkedTo: linkedTo == null ? null : await this.userEntityService.pack(linkedTo, me, { schema: 'UserLite' }),
				subAccounts: await this.userEntityService.packMany(subAccounts, me, { schema: 'UserLite' }),
			};
		});
	}
}
