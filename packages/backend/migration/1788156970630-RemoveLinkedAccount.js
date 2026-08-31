/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RemoveLinkedAccount1788156970630 {
    name = 'RemoveLinkedAccount1788156970630';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_e2d9662ff81808fd058f5bdc56"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "linkedToUserId"`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "linkedToUserId" character varying(32)`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."linkedToUserId" IS 'The ID of the main User this (sub-)account is linked to. Null if this account is not a linked sub-account.'`);
        await queryRunner.query(`CREATE INDEX "IDX_e2d9662ff81808fd058f5bdc56" ON "user" ("linkedToUserId")`);
    }
};
