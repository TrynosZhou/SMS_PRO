import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectShortTitle1776300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('subjects');
    if (!table?.findColumnByName('shortTitle')) {
      await queryRunner.query(
        `ALTER TABLE "subjects" ADD COLUMN "shortTitle" character varying(40)`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subjects" DROP COLUMN IF EXISTS "shortTitle"`);
  }
}
