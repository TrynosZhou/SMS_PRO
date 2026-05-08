import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherGenderColumn1773000000000 implements MigrationInterface {
  name = 'AddTeacherGenderColumn1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "gender" character varying(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" DROP COLUMN IF EXISTS "gender"`);
  }
}
