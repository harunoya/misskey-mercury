/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const VERSION_SUFFIX_PATTERN = /^[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*$/;

export function resolveVersion(packageVersion, suffix = process.env.MISSKEY_VERSION_SUFFIX) {
	const normalizedSuffix = suffix?.trim().replace(/^-+/, '');

	if (!normalizedSuffix) return packageVersion;
	if (!VERSION_SUFFIX_PATTERN.test(normalizedSuffix)) {
		throw new Error('MISSKEY_VERSION_SUFFIX must contain only letters, numbers, dots, and hyphens.');
	}

	return `${packageVersion}-${normalizedSuffix}`;
}
