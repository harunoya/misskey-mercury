/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const VERSION_SUFFIX_PATTERN = /^[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*$/;

export function resolveVersion(packageVersion, mercuryVersion, suffix = process.env.MISSKEY_VERSION_SUFFIX) {
	const normalizedMercuryVersion = mercuryVersion?.trim();
	const normalizedSuffix = suffix?.trim().replace(/^-+/, '');

	if (!normalizedMercuryVersion || !VERSION_SUFFIX_PATTERN.test(normalizedMercuryVersion)) {
		throw new Error('mercuryVersion must contain only letters, numbers, dots, and hyphens.');
	}
	if (normalizedSuffix && !VERSION_SUFFIX_PATTERN.test(normalizedSuffix)) {
		throw new Error('MISSKEY_VERSION_SUFFIX must contain only letters, numbers, dots, and hyphens.');
	}

	const mercurySuffix = `mercury.${normalizedMercuryVersion}`;
	if (!normalizedSuffix || normalizedSuffix === 'mercury' || normalizedSuffix === mercurySuffix) {
		return `${packageVersion}-${mercurySuffix}`;
	}

	return `${packageVersion}-${mercurySuffix}.${normalizedSuffix}`;
}
