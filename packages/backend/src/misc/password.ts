/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';

/**
 * Which client the account's credentials were created by.
 *
 * Read from the shape of the stored hash, because that is the only record of it: accounts carried
 * over by the CherryPick migration kept their Argon2id hashes, while anything Misskey created is
 * bcrypt. The control panel used to report the hashing algorithm itself, which told a moderator
 * more about how a specific person's password is stored than they need to know — the operational
 * question is only ever whether the account predates the move.
 */
export type AccountOrigin = 'misskey' | 'cherrypick' | 'unknown' | 'none';

/** Cost 8 is too cheap for offline cracking if the hash table leaks. */
export const BCRYPT_COST = 10;

export async function hashPassword(password: string): Promise<string> {
	const salt = await bcrypt.genSalt(BCRYPT_COST);
	return await bcrypt.hash(password, salt);
}

export function hashPasswordSync(password: string): string {
	return bcrypt.hashSync(password, BCRYPT_COST);
}

export function getAccountOrigin(hash: string | null): AccountOrigin {
	if (hash == null) return 'none';
	if (/^\$2[aby]\$/.test(hash)) return 'misskey';
	if (hash.startsWith('$argon2')) return 'cherrypick';
	return 'unknown';
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	if (!hash.startsWith('$argon2id$')) {
		return bcrypt.compare(password, hash);
	}

	try {
		return await argon2.verify(hash, password);
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}
