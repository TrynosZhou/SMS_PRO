import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubjectDepartmentId1776760000000 implements MigrationInterface {
  name = 'AddSubjectDepartmentId1776760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "departmentId" uuid NULL`);
    const table = await queryRunner.getTable('subjects');
    const fkName = 'FK_subjects_department';
    const hasFk = table?.foreignKeys.some((fk) => fk.name === fkName);
    if (!hasFk) {
      await queryRunner.query(
        `ALTER TABLE "subjects" ADD CONSTRAINT "${fkName}" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
      );
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_subjects_departmentId" ON "subjects" ("departmentId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subjects_departmentId"`);
    const table = await queryRunner.getTable('subjects');
    const fk = table?.foreignKeys.find((f) => f.name === 'FK_subjects_department');
    if (fk) {
      await queryRunner.dropForeignKey('subjects', fk);
    }
    await queryRunner.query(`ALTER TABLE "subjects" DROP COLUMN IF EXISTS "departmentId"`);
  }
}
