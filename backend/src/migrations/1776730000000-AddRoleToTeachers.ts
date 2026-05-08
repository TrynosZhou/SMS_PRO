import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleToTeachers1776730000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "role" character varying(16) NOT NULL DEFAULT 'Teacher'`);
    await queryRunner.query(`UPDATE "teachers" SET "role" = 'Teacher' WHERE "role" IS NULL OR trim("role") = ''`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" DROP COLUMN IF EXISTS "role"`);
  }
}

