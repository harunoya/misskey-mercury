/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, UserProfilesRepository, MiUserProfile } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';

/**
 * 関連アカウント機能: ローカルの複数アカウントを「メインアカウント」と「サブアカウント」として関連付ける。
 *
 * サブアカウントは関連付けられている間、自身の UserProfile.password を持たない (null)。認証は常に
 * メインアカウントの現在のパスワードで行う (resolveAuthProfile を参照)。メインのパスワードを変更すれば
 * 追従して全サブアカウントの認証にも反映される。1回きりのコピーではなく、常に委譲する設計。
 */
@Injectable()
export class LinkedAccountService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
	) {
	}

	/**
	 * user のサインイン/パスワード確認に使うべき UserProfile を返す。
	 * user がサブアカウントとして関連付けられている場合は、常にメインアカウントの profile を返す。
	 * user が関連付けられていない (大多数のケース) 場合、呼び出し側が既に取得済みの profile があれば
	 * ownProfile として渡すことで、同じ行への冗長な DB アクセスを避けられる。
	 */
	@bindThis
	public async resolveAuthProfile(user: MiUser, ownProfile?: MiUserProfile): Promise<MiUserProfile> {
		if (user.linkedToUserId == null) {
			return ownProfile ?? await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
		}
		return await this.userProfilesRepository.findOneByOrFail({ userId: user.linkedToUserId });
	}

	@bindThis
	public async hasLinkedSubAccounts(userId: MiUser['id']): Promise<boolean> {
		return await this.usersRepository.exists({ where: { linkedToUserId: userId } });
	}

	@bindThis
	public async listSubAccounts(userId: MiUser['id']): Promise<MiUser[]> {
		return await this.usersRepository.findBy({ linkedToUserId: userId });
	}

	/**
	 * 既存アカウント target を main のサブアカウントとして関連付ける。
	 * target の所有者確認 (現在のパスワード照合) は呼び出し側の責務。
	 * target 自身のパスワードは破棄され、以後 main の現在のパスワードで認証される。
	 */
	@bindThis
	public async link(main: MiUser, target: MiUser): Promise<void> {
		await this.usersRepository.update(target.id, { linkedToUserId: main.id });
		await this.userProfilesRepository.update(target.id, { password: null });
	}

	/**
	 * target の関連付けを解除し、独立したパスワードハッシュを設定する。
	 * 関連付け解除後にパスワード無しのアカウントを残さないため、newPasswordHash は必須。
	 */
	@bindThis
	public async unlink(target: MiUser, newPasswordHash: string): Promise<void> {
		await this.usersRepository.update(target.id, { linkedToUserId: null });
		await this.userProfilesRepository.update(target.id, { password: newPasswordHash });
	}
}
