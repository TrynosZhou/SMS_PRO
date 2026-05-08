import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectCategoryColumn1765000000000 implements MigrationInterface {
  name = 'AddSubjectCategoryColumn1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('subjects', 'category');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "subjects" ADD COLUMN "category" character varying NOT NULL DEFAULT 'IGCSE'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('subjects', 'category');
    if (hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "subjects" DROP COLUMN "category"`,
      );
    }
  }
}


