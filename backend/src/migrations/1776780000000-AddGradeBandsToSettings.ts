import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGradeBandsToSettings1776780000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('settings');
    if (table && !table.findColumnByName('gradeBands')) {
      await queryRunner.query(`ALTER TABLE "settings" ADD COLUMN "gradeBands" json`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "gradeBands"`);
  }
}
