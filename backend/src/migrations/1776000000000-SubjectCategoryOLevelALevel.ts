import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rename syllabus categories from IGCSE / AS_A_LEVEL to O_LEVEL / A_LEVEL.
 */
export class SubjectCategoryOLevelALevel1776000000000 implements MigrationInterface {
  name = 'SubjectCategoryOLevelALevel1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('subjects', 'category');
    if (!hasColumn) return;

    await queryRunner.query(
      `UPDATE "subjects" SET "category" = 'O_LEVEL' WHERE "category" = 'IGCSE'`,
    );
    await queryRunner.query(
      `UPDATE "subjects" SET "category" = 'A_LEVEL' WHERE "category" = 'AS_A_LEVEL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "subjects" ALTER COLUMN "category" SET DEFAULT 'O_LEVEL'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('subjects', 'category');
    if (!hasColumn) return;

    await queryRunner.query(
      `UPDATE "subjects" SET "category" = 'IGCSE' WHERE "category" = 'O_LEVEL'`,
    );
    await queryRunner.query(
      `UPDATE "subjects" SET "category" = 'AS_A_LEVEL' WHERE "category" = 'A_LEVEL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "subjects" ALTER COLUMN "category" SET DEFAULT 'IGCSE'`,
    );
  }
}
