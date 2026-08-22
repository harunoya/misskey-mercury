/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';

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
