/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Read-only pre-flight check for converting a https://github.com/yojo-art/cherrypick database
// (a CherryPick fork distinct from upstream CherryPick, which `cherrypick_bootstrap.js` already
// covers) with `migration:run`.
//
// yojo-art/cherrypick tracks upstream closely enough that, as of develop@5aa2c07c3364 (v1.10.0,
// 2026-08-29), none of its schema divergences trip up our migrations — this was verified by diffing
// its `packages/backend/migration` directory against ours and reading every migration unique to
// either side. But three of our migrations assume specific column state without an idempotency
// guard (a plain `ADD COLUMN` or a `DROP COLUMN` with no `IF EXISTS`), and one recreates
// `antenna_src_enum` from a hardcoded label list — all four succeed today only because the current
// schema happens to satisfy them, not because the migrations themselves are defensive. A yojo-art
// instance that's behind or ahead of that commit, or has been hand-modified, might not. Rather than
// re-deriving the answer by reading migration source every time, this checks the actual conditions
// those migrations depend on and reports which would fail before anyone runs `migration:run` for
// real.
//
// This does not touch the database or the `migrations` table (contrast `cherrypick_bootstrap.js`,
// which does). If a check fails here, the fix is either to patch the offending migration to be
// idempotent, or to extend `cherrypick_bootstrap.js` the way it already handles upstream CherryPick.

import dataSource from '../ormconfig.js';

await dataSource.initialize();

let hasFailure = false;

function pass(label) {
	console.log(`  ok  ${label}`);
}

function fail(label, detail) {
	hasFailure = true;
	console.error(`FAIL  ${label}`);
	if (detail) console.error(`      ${detail}`);
}

function warn(label, detail) {
	console.warn(`WARN  ${label}`);
	if (detail) console.warn(`      ${detail}`);
}

try {
	const [{ isCherryPick }] = await dataSource.query(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'meta'
				AND column_name = 'skipCherryPickVersion'
		) AS "isCherryPick"
	`);

	if (!isCherryPick) {
		console.log('This does not look like a CherryPick-family database (no meta.skipCherryPickVersion). Nothing to check.');
		process.exit(0);
	}

	const [{ hasHistory }] = await dataSource.query(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'migrations'
		) AS "hasHistory"
	`);

	if (!hasHistory) {
		fail('migrations table exists', 'No migration history. See cherrypick_bootstrap.js — the same "synchronize-built database" case applies here.');
		process.exit(1);
	}

	console.log('CherryPick-family database detected. Checking yojo-art/cherrypick compatibility assumptions:');

	// RevertNoteEdit1696388600237 runs `ALTER TABLE "note" DROP COLUMN "updatedAt"` with no
	// `IF EXISTS`. yojo-art still ships this column (it removed its own `noteEditHistory` array
	// column separately, under a different migration, and never touched `updatedAt`), so this
	// currently succeeds — but only because the column is still there.
	const [{ hasNoteUpdatedAt }] = await dataSource.query(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'note' AND column_name = 'updatedAt'
		) AS "hasNoteUpdatedAt"
	`);
	if (hasNoteUpdatedAt) {
		pass('note.updatedAt exists (RevertNoteEdit1696388600237 can drop it)');
	} else {
		fail(
			'note.updatedAt exists (RevertNoteEdit1696388600237 can drop it)',
			'Column is already gone. `ALTER TABLE "note" DROP COLUMN "updatedAt"` has no IF EXISTS and will abort migration:run. Give that migration a guarded DROP COLUMN IF EXISTS, or record it as already-applied the way cherrypick_bootstrap.js does for vanilla CherryPick.',
		);
	}

	// SensitiveMediaDetectionExternalService1780488454126 and UrlPreviewSensitiveList1782581064131
	// both use a plain `ADD COLUMN`. As of yojo-art/cherrypick v1.10.0 neither column exists yet, so
	// this succeeds — but it means a yojo-art instance that has since picked these up under the same
	// names (e.g. by merging further upstream Misskey history itself) would fail here.
	const metaColumnChecks = [
		['sensitiveMediaDetectionApiUrl', 'SensitiveMediaDetectionExternalService1780488454126'],
		['sensitiveMediaDetectionApiKey', 'SensitiveMediaDetectionExternalService1780488454126'],
		['sensitiveMediaDetectionTimeout', 'SensitiveMediaDetectionExternalService1780488454126'],
		['sensitiveMediaDetectionMaxImagesPerRequest', 'SensitiveMediaDetectionExternalService1780488454126'],
		['urlPreviewSensitiveList', 'UrlPreviewSensitiveList1782581064131'],
	];
	for (const [column, migration] of metaColumnChecks) {
		const [{ exists }] = await dataSource.query(`
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'meta' AND column_name = $1
			) AS "exists"
		`, [column]);
		if (!exists) {
			pass(`meta.${column} does not exist yet (${migration} can add it)`);
		} else {
			fail(
				`meta.${column} does not exist yet (${migration} can add it)`,
				`Column already present. ${migration}'s plain ADD COLUMN has no IF NOT EXISTS and will abort migration:run. Give it a guarded ADD COLUMN IF NOT EXISTS instead.`,
			);
		}
	}

	// CherryPickToMisskey1787499975266 now widens these unconditionally (ALTER COLUMN ... TYPE to a
	// wider varchar always succeeds, whatever the current width), so this can never fail migration:run
	// — it's here to surface the same drift found on a real yojo-art/cherrypick database: its
	// `migrations` table claimed tweakVarcharLength1678426061773 already widened these to 1024, but
	// the actual columns were still varchar(256).
	const smtpColumnWidths = await dataSource.query(`
		SELECT column_name AS "columnName", character_maximum_length AS "maxLength"
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'meta'
			AND column_name IN ('smtpHost', 'smtpUser', 'smtpPass')
	`);
	for (const { columnName, maxLength } of smtpColumnWidths) {
		pass(`meta.${columnName} is varchar(${maxLength}) (CherryPickToMisskey1787499975266 will normalize it to 1024 regardless)`);
	}

	// CherryPickToMisskey1787499975266 deletes antennas with src = 'group' and then recreates
	// antenna_src_enum from a hardcoded 5-value list (home, all, users, list, users_blacklist). Any
	// row left over with a src value outside {those 5, group} would make the enum-widening cast fail.
	const rowsWithUnexpectedSrc = await dataSource.query(`
		SELECT DISTINCT "src"::text AS src FROM "antenna"
		WHERE "src"::text NOT IN ('home', 'all', 'users', 'list', 'group', 'users_blacklist')
	`);
	if (rowsWithUnexpectedSrc.length === 0) {
		pass('antenna.src has no values outside the CherryPick set (CherryPickToMisskey1787499975266 can rebuild the enum)');
	} else {
		fail(
			'antenna.src has no values outside the CherryPick set (CherryPickToMisskey1787499975266 can rebuild the enum)',
			`Found: ${rowsWithUnexpectedSrc.map(r => r.src).join(', ')}. The antenna_src_enum rebuild has no case for these; migration:run will fail casting them.`,
		);
	}

	// Not a failure: CherryPickToMisskey1787499975266 narrows these chart columns with
	// LEAST/GREATEST clamping rather than failing outright, so overflow here is silent precision
	// loss on old chart data, not a broken migration.
	for (const table of ['__chart__instance', '__chart_day__instance']) {
		const [row] = await dataSource.query(`
			SELECT
				MAX("___requests_failed") AS "maxFailed",
				MIN("___requests_failed") AS "minFailed",
				MAX("___requests_succeeded") AS "maxSucceeded",
				MIN("___requests_succeeded") AS "minSucceeded",
				MAX("___requests_received") AS "maxReceived",
				MIN("___requests_received") AS "minReceived",
				MAX("___notes_total") AS "maxNotesTotal",
				MIN("___notes_total") AS "minNotesTotal"
			FROM "${table}"
		`);
		const smallintOverflow = ['maxFailed', 'minFailed', 'maxSucceeded', 'minSucceeded', 'maxReceived', 'minReceived']
			.some(key => row[key] != null && (row[key] > 32767 || row[key] < -32768));
		const intOverflow = row.maxNotesTotal != null && (row.maxNotesTotal > 2147483647 || row.minNotesTotal < -2147483648);
		if (smallintOverflow || intOverflow) {
			warn(
				`${table} request/notes counters fit the narrower types CherryPickToMisskey1787499975266 casts to`,
				`Some values are out of range and will be clamped (LEAST/GREATEST), not preserved exactly. migration:run will still succeed.`,
			);
		} else {
			pass(`${table} request/notes counters fit the narrower types CherryPickToMisskey1787499975266 casts to`);
		}
	}

	console.log(hasFailure
		? '\nOne or more checks failed. Fix these before running `pnpm migrate` against this database.'
		: '\nAll checks passed. This database looks safe to convert with `pnpm migrate`.');
} finally {
	await dataSource.destroy();
}

process.exit(hasFailure ? 1 : 0);
