import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolMotto2And3177610000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('settings');

    if (!table?.findColumnByName('schoolMotto2')) {
      await queryRunner.query(`ALTER TABLE "settings" ADD COLUMN "schoolMotto2" text`);
      table = await queryRunner.getTable('settings');
    }

    if (!table?.findColumnByName('schoolMotto3')) {
      await queryRunner.query(`ALTER TABLE "settings" ADD COLUMN "schoolMotto3" text`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "schoolMotto3"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "schoolMotto2"`);
  }
}
