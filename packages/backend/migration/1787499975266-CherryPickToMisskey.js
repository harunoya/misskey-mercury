/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const cherryPickOnlyColumns = {
    user: [
        'isIndexable',
        'searchableBy',
        'setFederationAvatarShape',
        'isSquareAvatars',
        'autoDeleteNotesAfterDays',
        'autoDeleteKeepFavorites',
        'canChat',
        'outbox',
        'clipsUri',
        'channelId',
    ],
    meta: [
        'directSummalyProxy',
        'useRemoteObjectStorage',
        'remoteObjectStoragePort',
        'remoteObjectStorageUseSSL',
        'remoteObjectStorageUseProxy',
        'remoteObjectStorageSetPublicRead',
        'remoteObjectStorageS3ForcePathStyle',
        'doNotSendNotificationEmailsForAbuseReport',
        'enableReceivePrerelease',
        'skipVersion',
        'disableRegistrationWhenInactive',
        'disablePublicNoteWhenInactive',
        'moderatorInactivityLimitDays',
        'youBlockedImageUrl',
        'translatorType',
        'ctav3SaKey',
        'ctav3ProjectId',
        'ctav3Location',
        'ctav3Model',
        'ctav3Glossary',
        'libreTranslateEndPoint',
        'libreTranslateApiKey',
        'statusUrl',
        'remoteObjectStorageBucket',
        'remoteObjectStoragePrefix',
        'remoteObjectStorageBaseUrl',
        'remoteObjectStorageEndpoint',
        'remoteObjectStorageRegion',
        'remoteObjectStorageAccessKey',
        'remoteObjectStorageSecretKey',
        'trustedLinkUrlPatterns',
        'emailToReceiveAbuseReport',
        'skipCherryPickVersion',
        'customSplashText',
        'bubbleInstances',
        'customRobotsTxt',
    ],
    user_profile: ['mutualLinkSections'],
    antenna: ['notify', 'userGroupJoiningId'],
    avatar_decoration: ['remoteId', 'host', 'rawUrl'],
    channel: ['host', 'actorId'],
    chat_message: ['emojis'],
    clip: ['lastFetchedAt', 'uri'],
    note: ['updatedAt', 'updatedAtHistory', 'deleteAt', 'hasEvent', 'searchableBy'],
    emoji: ['copyPermission', 'usageInfo', 'description', 'author', 'isBasedOn', 'importFrom'],
    instance: [
        'rejectionConsecutiveDays',
        'latestRejectedRequestAt',
        'latestInboxRejectedRequestAt',
        'latestDeliverRejectedRequestAt',
        'temporaryInboxBlockedUntil',
        'quarantineLimited',
        'reversiVersion',
    ],
    note_draft: ['hasEvent', 'searchableBy', 'eventStart', 'eventEnd', 'eventMetadata', 'deleteAt', 'eventTitle'],
    reversi_game: ['federationId'],
    user_ip: ['dnsNames'],
    __chart__federation: ['___software'],
    __chart_day__federation: ['___software'],
};

const cherryPickOnlyTables = [
    'abuse_report_resolver',
    'clip_favorite_remote',
    'event',
    'flash_like_remote',
    'note_history',
    'note_unread',
    'official_tag',
    'user_group_invitation',
    'user_group_joining',
    'user_group',
];

const cherryPickOnlyTypes = [
    'user_searchableby_enum',
    'note_searchableby_enum',
    'note_draft_searchableby_enum',
    'emoji_copypermission_enum',
];

// CherryPick is not simply Misskey plus extras: it also lags behind on upstream changes it never
// merged. Whether those close on their own depends on what the fork recorded in `migrations`, and a
// history that claims a migration ran when the schema says otherwise leaves the entity definitions
// pointing at columns that do not exist. Restating them here is idempotent and costs nothing when
// the upstream migration already applied.
const missingUpstreamColumns = [
    ['meta', 'sensitiveMediaDetectionApiUrl', `character varying(1024)`],
    ['meta', 'sensitiveMediaDetectionApiKey', `character varying(1024)`],
    ['meta', 'sensitiveMediaDetectionTimeout', `integer NOT NULL DEFAULT '60000'`],
    ['meta', 'sensitiveMediaDetectionMaxImagesPerRequest', `integer NOT NULL DEFAULT '4'`],
    ['meta', 'urlPreviewSensitiveList', `character varying(3072) array NOT NULL DEFAULT '{}'`],
];

// Same story, but for defaults rather than whole columns.
const missingUpstreamDefaults = [
    ['hashtag', 'mentionedUserIds', `'{}'`],
    ['hashtag', 'mentionedLocalUserIds', `'{}'`],
    ['hashtag', 'mentionedRemoteUserIds', `'{}'`],
    ['hashtag', 'attachedUserIds', `'{}'`],
    ['hashtag', 'attachedLocalUserIds', `'{}'`],
    ['hashtag', 'attachedRemoteUserIds', `'{}'`],
];

export class CherryPickToMisskey1787499975266 {
    name = 'CherryPickToMisskey1787499975266'

    async up(queryRunner) {
        // Deliberately narrow. `user_group` and the `group` antenna source look like CherryPick
        // markers but Misskey carried both itself, so widening the test to them makes this migration
        // fire on a plain Misskey database and start dismantling it. `skipCherryPickVersion` is the
        // one column Misskey never had.
        const [{ isCherryPick }] = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = 'meta'
                    AND column_name = 'skipCherryPickVersion'
            ) AS "isCherryPick"
        `);

        if (!isCherryPick) return;

        // Antennas that depend on the removed user-group source have no Misskey equivalent.
        await queryRunner.query(`DELETE FROM "antenna" WHERE "src"::text = 'group'`);

        for (const [table, columns] of Object.entries(cherryPickOnlyColumns)) {
            for (const column of columns) {
                await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${column}" CASCADE`);
            }
        }

        for (const table of cherryPickOnlyTables) {
            await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        }

        for (const type of cherryPickOnlyTypes) {
            await queryRunner.query(`DROP TYPE IF EXISTS "public"."${type}"`);
        }

        for (const [table, column, definition] of missingUpstreamColumns) {
            await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${definition}`);
        }

        for (const [table, column, value] of missingUpstreamDefaults) {
            await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT ${value}`);
        }

        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/misskey-dev/misskey/issues/new'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "preservedUsernames" SET DEFAULT '{admin,administrator,root,system,maintainer,host,mod,moderator,owner,superuser,staff,auth,i,me,everyone,all,mention,mentions,example,user,users,account,accounts,official,help,helps,support,supports,info,information,informations,announce,announces,announcement,announcements,notice,notification,notifications,dev,developer,developers,tech,misskey}'`);
        await queryRunner.query(`ALTER TABLE "user_profile" ALTER COLUMN "emailNotificationTypes" SET DEFAULT '["follow","receiveFollowRequest"]'`);

        await queryRunner.query(`ALTER TYPE "public"."antenna_src_enum" RENAME TO "antenna_src_enum_cherrypick"`);
        await queryRunner.query(`CREATE TYPE "public"."antenna_src_enum" AS ENUM('home', 'all', 'users', 'list', 'users_blacklist')`);
        await queryRunner.query(`ALTER TABLE "antenna" ALTER COLUMN "src" TYPE "public"."antenna_src_enum" USING "src"::text::"public"."antenna_src_enum"`);
        await queryRunner.query(`DROP TYPE "public"."antenna_src_enum_cherrypick"`);

        for (const table of ['__chart__instance', '__chart_day__instance']) {
            for (const column of ['___requests_failed', '___requests_succeeded', '___requests_received']) {
                await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE smallint USING LEAST(GREATEST("${column}", -32768), 32767)::smallint`);
            }
            await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "___notes_total" TYPE integer USING LEAST(GREATEST("___notes_total", -2147483648), 2147483647)::integer`);
        }

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "channel_following" ("id" character varying(32) NOT NULL, "followeeId" character varying(32) NOT NULL, "followerId" character varying(32) NOT NULL, CONSTRAINT "PK_8b104be7f7415113f2a02cd5bdd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`COMMENT ON COLUMN "channel_following"."followeeId" IS 'The followee channel ID.'`);
        await queryRunner.query(`COMMENT ON COLUMN "channel_following"."followerId" IS 'The follower user ID.'`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_0e43068c3f92cab197c3d3cd86" ON "channel_following" ("followeeId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_6d8084ec9496e7334a4602707e" ON "channel_following" ("followerId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_2e230dd45a10e671d781d99f3e" ON "channel_following" ("followerId", "followeeId")`);
        // Every other statement in this block tolerates the table already being there; these did
        // not, because Postgres has no ADD CONSTRAINT IF NOT EXISTS. A fork that already created
        // `channel_following` would fail the whole migration on the very last two statements.
        const addConstraintIfMissing = (name, definition) => queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
                    ALTER TABLE "channel_following" ADD CONSTRAINT "${name}" ${definition};
                END IF;
            END $$
        `);

        await addConstraintIfMissing('FK_0e43068c3f92cab197c3d3cd86e', `FOREIGN KEY ("followeeId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await addConstraintIfMissing('FK_6d8084ec9496e7334a4602707e1', `FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down() {
        throw new Error('CherryPickToMisskey is irreversible because CherryPick-only data is intentionally discarded. Restore the pre-migration database backup instead.');
    }
}
