/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

interface AdminApiRoot {
	api: (endpoint: string, data?: Record<string, unknown>) => Promise<any>;
}

interface CurrentRolePolicy {
	useDefault?: boolean;
	priority?: number;
	value?: unknown;
}

interface CurrentRole {
	id: string;
	name?: string;
	description?: string;
	target?: string;
	policies?: Record<string, CurrentRolePolicy>;
}

const SILENCE_ROLE_NAME = 'Mercury v11: Silenced';
const SILENCE_ROLE_MARKER = '[frontend-v11:canPublicNote=false]';

function isSilenceRole(role: CurrentRole): boolean {
	const policy = role.policies?.canPublicNote;
	return role.target === 'manual'
		&& role.description?.includes(SILENCE_ROLE_MARKER) === true
		&& policy?.useDefault === false
		&& policy.value === false;
}

async function getOrCreateSilenceRole(root: AdminApiRoot): Promise<CurrentRole> {
	const roles = await root.api('admin/roles/list');
	const existing = Array.isArray(roles) ? roles.find(isSilenceRole) : null;
	if (existing) return existing;

	return await root.api('admin/roles/create', {
		name: SILENCE_ROLE_NAME,
		description: `${SILENCE_ROLE_MARKER} Compatibility role used by the Misskey v11 administration UI.`,
		color: '#e6a23c',
		iconUrl: null,
		target: 'manual',
		condFormula: { id: 'frontend-v11-silence', type: 'isRemote' },
		isPublic: false,
		isModerator: false,
		isAdministrator: false,
		isExplorable: false,
		asBadge: false,
		preserveAssignmentOnMoveAccount: false,
		canEditMembersByModerator: true,
		displayOrder: 0,
		policies: {
			canPublicNote: {
				useDefault: false,
				priority: 2,
				value: false,
			},
		},
	});
}

/** Implements v11's silence action using the current backend's role-policy model. */
export async function silenceCurrentUser(root: AdminApiRoot, userId: string): Promise<void> {
	const role = await getOrCreateSilenceRole(root);
	await root.api('admin/roles/assign', { roleId: role.id, userId, expiresAt: null });

	const info = await root.api('admin/show-user', { userId });
	if (info?.isSilenced !== true) {
		throw new Error('The user still has a priority-2 role that permits public notes. Review their assigned roles in the current administration UI.');
	}
}

/** Removes only the compatibility role so unrelated role assignments are never destroyed. */
export async function unsilenceCurrentUser(root: AdminApiRoot, userId: string): Promise<void> {
	const [roles, info] = await Promise.all([
		root.api('admin/roles/list'),
		root.api('admin/show-user', { userId }),
	]);
	const role = Array.isArray(roles) ? roles.find(isSilenceRole) : null;
	const assignedRoleIds = new Set(Array.isArray(info?.roleAssigns)
		? info.roleAssigns.map((assignment: { roleId?: string }) => assignment.roleId)
		: []);

	if (role && assignedRoleIds.has(role.id)) {
		await root.api('admin/roles/unassign', { roleId: role.id, userId });
	}

	const refreshed = await root.api('admin/show-user', { userId });
	if (refreshed?.isSilenced === true) {
		throw new Error('This user is silenced by another current-backend role. Remove that role assignment from the current administration UI.');
	}
}

interface AdminUsersQuery {
	state: string;
	origin: string;
	sort: string;
	offset: number;
	limit: number;
	username?: string | null;
	hostname?: string | null;
}

/** Preserves v11's silenced filter although current admin/show-users has no silenced state value. */
export async function fetchCurrentAdminUsers(root: AdminApiRoot, query: AdminUsersQuery): Promise<any[]> {
	if (query.state !== 'silenced') return await root.api('admin/show-users', { ...query });

	const wanted = query.offset + query.limit;
	const matches: any[] = [];
	let backendOffset = 0;

	while (matches.length < wanted) {
		const page = await root.api('admin/show-users', {
			...query,
			state: 'all',
			offset: backendOffset,
			limit: 100,
		});
		if (!Array.isArray(page) || page.length === 0) break;
		matches.push(...page.filter(user => user?.isSilenced === true));
		backendOffset += page.length;
		if (page.length < 100) break;
	}

	return matches.slice(query.offset, wanted);
}
