/*
 * SPDX-FileCopyrightText: noridev and cherrypick-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ApprovalSignup1787578900933 {
    name = 'ApprovalSignup1787578900933'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "approvalRequiredForSignup" boolean DEFAULT false NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user" ADD "approved" boolean DEFAULT true NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user" ADD "signupReason" character varying(1000) NULL`);
        await queryRunner.query(`ALTER TABLE "user_pending" ADD "reason" character varying(1000) NULL`);
        await queryRunner.query(`ALTER TABLE "user_pending" ADD "approvalRequired" boolean DEFAULT false NOT NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_pending" DROP COLUMN "approvalRequired"`);
        await queryRunner.query(`ALTER TABLE "user_pending" DROP COLUMN "reason"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "signupReason"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "approved"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "approvalRequiredForSignup"`);
    }
}
