/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { UsersRepository } from '@/models/_.js';
import { QueueService } from '@/core/QueueService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { LinkedAccountService } from '@/core/LinkedAccountService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:account',

	errors: {
		hasLinkedSubAccounts: {
			message: 'This account still has linked sub accounts. Unlink them before deleting this account.',
			code: 'HAS_LINKED_SUB_ACCOUNTS',
			id: 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c0d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private deleteAccoountService: DeleteAccountService,
		private linkedAccountService: LinkedAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });

			if (user == null) {
				throw new Error('user not found');
			}

			if (await this.linkedAccountService.hasLinkedSubAccounts(user.id)) {
				throw new ApiError(meta.errors.hasLinkedSubAccounts);
			}

			await this.deleteAccoountService.deleteAccount(user, me);
		});
	}
}
