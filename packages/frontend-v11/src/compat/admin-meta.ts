/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

interface AdminRoot {
	api: (endpoint: string, data?: Record<string, unknown>) => Promise<any>;
}

type AdminMetaState = Record<string, any>;

function nullableNumber(value: unknown): number | null {
	if (value === '' || value == null) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function loadV11AdminMeta(root: AdminRoot): Promise<AdminMetaState> {
	const [meta, publicMeta] = await Promise.all([
		root.api('admin/meta'),
		root.api('meta', { detail: false }),
	]);
	let proxyAccount = null;
	if (typeof meta.proxyAccountId === 'string') {
		try {
			const user = await root.api('users/show', { userId: meta.proxyAccountId });
			proxyAccount = user.host ? `${user.username}@${user.host}` : user.username;
		} catch {
			proxyAccount = null;
		}
	}

	const policies = meta.policies ?? {};
	return {
		maintainerName: meta.maintainerName,
		maintainerEmail: meta.maintainerEmail,
		ToSUrl: meta.tosUrl,
		repositoryUrl: meta.repositoryUrl,
		feedbackUrl: meta.feedbackUrl,
		disableRegistration: meta.disableRegistration,
		disableLocalTimeline: policies.ltlAvailable === false,
		disableGlobalTimeline: policies.gtlAvailable === false,
		enableEmojiReaction: true,
		useStarForReactionFallback: false,
		mascotImageUrl: meta.mascotImageUrl,
		bannerUrl: meta.bannerUrl,
		errorImageUrl: meta.serverErrorImageUrl,
		iconUrl: meta.iconUrl,
		name: meta.name,
		description: meta.description,
		languages: Array.isArray(meta.langs) ? meta.langs.join(' ') : '',
		cacheRemoteFiles: meta.cacheRemoteFiles,
		proxyRemoteFiles: meta.proxyRemoteFiles,
		localDriveCapacityMb: policies.driveCapacityMb ?? null,
		remoteDriveCapacityMb: policies.driveCapacityMb ?? null,
		maxNoteTextLength: publicMeta.maxNoteTextLength,
		enableRecaptcha: meta.enableRecaptcha,
		recaptchaSiteKey: meta.recaptchaSiteKey,
		recaptchaSecretKey: meta.recaptchaSecretKey,
		proxyAccount,
		summalyProxy: meta.urlPreviewSummaryProxyUrl ?? meta.summalyProxy,
		enableEmail: meta.enableEmail,
		email: meta.email,
		smtpSecure: meta.smtpSecure,
		smtpHost: meta.smtpHost,
		smtpPort: meta.smtpPort,
		smtpUser: meta.smtpUser,
		smtpPass: meta.smtpPass,
		smtpAuth: meta.smtpUser != null && meta.smtpUser !== '',
		enableServiceWorker: meta.enableServiceWorker,
		swPublicKey: meta.swPublickey,
		swPrivateKey: meta.swPrivateKey,
		pinnedUsers: Array.isArray(meta.pinnedUsers) ? meta.pinnedUsers.join('\n') : '',
		hiddenTags: Array.isArray(meta.hiddenTags) ? meta.hiddenTags.join('\n') : '',
		useObjectStorage: meta.useObjectStorage,
		objectStorageBaseUrl: meta.objectStorageBaseUrl,
		objectStorageBucket: meta.objectStorageBucket,
		objectStoragePrefix: meta.objectStoragePrefix,
		objectStorageEndpoint: meta.objectStorageEndpoint,
		objectStorageRegion: meta.objectStorageRegion,
		objectStoragePort: meta.objectStoragePort,
		objectStorageAccessKey: meta.objectStorageAccessKey,
		objectStorageSecretKey: meta.objectStorageSecretKey,
		objectStorageUseSSL: meta.objectStorageUseSSL,
		__currentPolicies: policies,
	};
}

export async function saveV11AdminMeta(root: AdminRoot, state: AdminMetaState): Promise<void> {
	const currentPolicies = state.__currentPolicies ?? {};
	const driveCapacityMb = nullableNumber(state.localDriveCapacityMb) ?? currentPolicies.driveCapacityMb;
	const policies = {
		...currentPolicies,
		ltlAvailable: !state.disableLocalTimeline,
		gtlAvailable: !state.disableGlobalTimeline,
		...(driveCapacityMb == null ? {} : { driveCapacityMb }),
	};

	await Promise.all([
		root.api('admin/update-meta', {
			maintainerName: nullableString(state.maintainerName),
			maintainerEmail: nullableString(state.maintainerEmail),
			tosUrl: nullableString(state.ToSUrl),
			repositoryUrl: nullableString(state.repositoryUrl),
			feedbackUrl: nullableString(state.feedbackUrl),
			disableRegistration: state.disableRegistration === true,
			mascotImageUrl: nullableString(state.mascotImageUrl),
			bannerUrl: nullableString(state.bannerUrl),
			serverErrorImageUrl: nullableString(state.errorImageUrl),
			iconUrl: nullableString(state.iconUrl),
			name: nullableString(state.name),
			description: nullableString(state.description),
			langs: typeof state.languages === 'string' ? state.languages.split(/\s+/).filter(Boolean) : [],
			cacheRemoteFiles: state.cacheRemoteFiles === true,
			proxyRemoteFiles: state.proxyRemoteFiles === true,
			enableRecaptcha: state.enableRecaptcha === true,
			recaptchaSiteKey: nullableString(state.recaptchaSiteKey),
			recaptchaSecretKey: nullableString(state.recaptchaSecretKey),
			urlPreviewSummaryProxyUrl: nullableString(state.summalyProxy),
			enableEmail: state.enableEmail === true,
			email: nullableString(state.email),
			smtpSecure: state.smtpSecure === true,
			smtpHost: nullableString(state.smtpHost),
			smtpPort: nullableNumber(state.smtpPort),
			smtpUser: state.smtpAuth ? nullableString(state.smtpUser) : null,
			smtpPass: state.smtpAuth ? nullableString(state.smtpPass) : null,
			enableServiceWorker: state.enableServiceWorker === true,
			swPublicKey: nullableString(state.swPublicKey),
			swPrivateKey: nullableString(state.swPrivateKey),
			pinnedUsers: typeof state.pinnedUsers === 'string' ? state.pinnedUsers.split('\n').filter(Boolean) : [],
			hiddenTags: typeof state.hiddenTags === 'string' ? state.hiddenTags.split('\n').filter(Boolean) : [],
			useObjectStorage: state.useObjectStorage === true,
			objectStorageBaseUrl: nullableString(state.objectStorageBaseUrl),
			objectStorageBucket: nullableString(state.objectStorageBucket),
			objectStoragePrefix: nullableString(state.objectStoragePrefix),
			objectStorageEndpoint: nullableString(state.objectStorageEndpoint),
			objectStorageRegion: nullableString(state.objectStorageRegion),
			objectStoragePort: nullableNumber(state.objectStoragePort),
			objectStorageAccessKey: nullableString(state.objectStorageAccessKey),
			objectStorageSecretKey: nullableString(state.objectStorageSecretKey),
			objectStorageUseSSL: state.objectStorageUseSSL === true,
		}),
		root.api('admin/roles/update-default-policies', { policies }),
	]);
}
