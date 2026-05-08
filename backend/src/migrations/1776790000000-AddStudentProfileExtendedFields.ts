import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentProfileExtendedFields1776790000000 implements MigrationInterface {
  name = 'AddStudentProfileExtendedFields1776790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "nationalId" character varying(32)
    `);
    await queryRunner.query(`
      ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "email" character varying(254)
    `);
    await queryRunner.query(`
      ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "dateOfJoining" date
    `);
    await queryRunner.query(`
      ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "previousSchool" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "previousSchool"`);
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "dateOfJoining"`);
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "email"`);
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "nationalId"`);
  }
}
