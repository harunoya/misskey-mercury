/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * One `stats` message from the server's stream, as v11's widgets need to read it.
 *
 * v11 was written against a server that sent `cpu_usage`; the current one sends `cpu`. Reading the
 * old name gives `undefined`, and every widget that plots it multiplies that into its geometry —
 * which is how the server widgets came to emit `points="1,NaN 2,NaN …"` and `cy="NaN"` on every
 * message, one console error per attribute per tick.
 */
export type ServerStats = {
	cpu?: number;
	cpu_usage?: number;
	mem?: { active?: number; used?: number; total?: number };
};

/**
 * CPU load from a `stats` message, as a fraction between 0 and 1.
 *
 * Falls back to the name v11 originally used so the widgets keep working against an older server,
 * and to 0 rather than `undefined` so a missing field cannot reach the SVG as `NaN`.
 */
export function cpuUsageOf(stats: ServerStats | null | undefined): number {
	const value = stats?.cpu ?? stats?.cpu_usage;
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
