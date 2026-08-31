/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';

export type PasswordHashType = 'bcrypt' | 'legacy' | 'unknown' | 'none';

/** Cost 8 is too cheap for offline cracking if the hash table leaks. */
export const BCRYPT_COST = 10;

export async function hashPassword(password: string): Promise<string> {
	const salt = await bcrypt.genSalt(BCRYPT_COST);
	return await bcrypt.hash(password, salt);
}

export function hashPasswordSync(password: string): string {
	return bcrypt.hashSync(password, BCRYPT_COST);
}

export function getPasswordHashType(hash: string | null): PasswordHashType {
	if (hash == null) return 'none';
	if (/^\$2[aby]\$/.test(hash)) return 'bcrypt';
	if (hash.startsWith('$argon2')) return 'legacy';
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
