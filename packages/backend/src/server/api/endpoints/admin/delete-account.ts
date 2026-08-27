/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { LinkedAccountService } from '@/core/LinkedAccountService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:delete-account',

	errors: {
		hasLinkedSubAccounts: {
			message: 'This account still has linked sub accounts. Unlink them before deleting this account.',
			code: 'HAS_LINKED_SUB_ACCOUNTS',
			id: 'f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c',
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

		private deleteAccountService: DeleteAccountService,
		private linkedAccountService: LinkedAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.usersRepository.findOneByOrFail({ id: ps.userId });
			if (user.isDeleted) {
				return;
			}

			if (await this.linkedAccountService.hasLinkedSubAccounts(user.id)) {
				throw new ApiError(meta.errors.hasLinkedSubAccounts);
			}

			await this.deleteAccountService.deleteAccount(user, me);
		});
	}
}
