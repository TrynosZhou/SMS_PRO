import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankingDetailsToSettings1776840000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('settings');
    if (table && !table.findColumnByName('bankingDetails')) {
      await queryRunner.query(`ALTER TABLE "settings" ADD COLUMN "bankingDetails" json`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "bankingDetails"`);
  }
}
