/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Prepares a CherryPick database so that `migration:run` can convert it to Misskey.
//
// CherryPick ships its own migration set. Nine Misskey migrations are absent from CherryPick 4.17.0,
// so TypeORM treats them as pending and runs them against a 2026-era CherryPick schema. Four cannot
// survive that: they either reference tables Misskey has since dropped, or recreate things
// CherryPick already built under a migration name of its own. All four are ordered before
// CherryPickToMisskey, so the conversion never gets a chance to clean up after them.
//
// This has to run outside the migration runner: TypeORM resolves the pending list once, up front,
// so a migration cannot exclude one of its successors by writing to the `migrations` table.

import dataSource from '../ormconfig.js';

/**
 * Migrations that fail against a real CherryPick schema, with the reason each one is safe to mark
 * as applied. Verified against a CherryPick 4.17.0 database; with these four recorded, the
 * conversion completes and `check-migrations` reports no pending DDL.
 */
const unrunnableOnCherryPick = [
	{
		timestamp: 1676434944993,
		name: 'dropGroup1676434944993',
		reason: 'drops user-group columns from `notification`, a table later Misskey versions removed entirely; CherryPickToMisskey drops the user-group tables itself',
	},
	{
		timestamp: 1761569941833,
		name: 'AddChannelMuting1761569941833',
		reason: 'CherryPick already ships channel muting under its own migration, so `channel_muting` exists',
	},
	{
		timestamp: 1766652173085,
		name: 'AddCategoryToAvatarDecorations1766652173085',
		reason: 'CherryPick already added `avatar_decoration.category`',
	},
	{
		timestamp: 1767169026317,
		name: 'BirthdayIndex1767169026317',
		reason: 'expects a birthday index CherryPick never created, and drops it before recreating',
	},
];

await dataSource.initialize();

try {
	const [{ isCherryPick }] = await dataSource.query(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'meta'
				AND column_name = 'skipCherryPickVersion'
		) AS "isCherryPick"
	`);

	if (!isCherryPick) {
		process.exit(0);
	}

	const [{ hasHistory }] = await dataSource.query(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'migrations'
		) AS "hasHistory"
	`);

	// Without a history TypeORM considers every migration pending and starts from `Init`, which
	// collides with the existing schema on its first statement. Nothing here can repair that, and
	// guessing which migrations "must have" run would be worse than stopping.
	if (!hasHistory) {
		console.error('This looks like a CherryPick database, but it has no `migrations` table.');
		console.error('TypeORM would try to replay every migration from the beginning and fail on the first one.');
		console.error('A database built with `synchronize` (CherryPick\'s compose-based dev setup does this) cannot be converted;');
		console.error('migrate the CherryPick instance itself first so that it records a migration history.');
		process.exit(1);
	}

	console.log('CherryPick database detected. Recording the migrations that cannot run against it:');

	for (const migration of unrunnableOnCherryPick) {
		// The casts are load-bearing: without them Postgres infers `text` from the SELECT list and
		// `character varying` from the comparison against `migrations.name`, and refuses the query.
		const result = await dataSource.query(
			`INSERT INTO "migrations" ("timestamp", "name")
			 SELECT $1::bigint, $2::character varying
			 WHERE NOT EXISTS (SELECT 1 FROM "migrations" WHERE "name" = $2::character varying)
			 RETURNING "name"`,
			[migration.timestamp, migration.name],
		);

		console.log(result.length > 0
			? `  recorded ${migration.name} — ${migration.reason}`
			: `  ${migration.name} already recorded`);
	}

	console.log('Done. Run the migrations now; CherryPickToMisskey will convert the schema.');
} finally {
	await dataSource.destroy();
}
