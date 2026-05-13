import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromotionRuleMinimumAverage1776820000000 implements MigrationInterface {
  name = 'AddPromotionRuleMinimumAverage1776820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "promotion_rules"
      ADD COLUMN IF NOT EXISTS "minimumAveragePercent" double precision NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "promotion_rules" DROP COLUMN IF EXISTS "minimumAveragePercent"
    `);
  }
}
