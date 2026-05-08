import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeacherContractLessons1776400000000 implements MigrationInterface {
  name = 'CreateTeacherContractLessons1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasTable('teacher_contract_lessons');
    if (has) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE "teacher_contract_lessons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "teacherId" uuid NOT NULL,
        "classId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "isDoublePeriod" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_teacher_contract_lessons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_teacher_contract_lessons_triple" UNIQUE ("teacherId", "classId", "subjectId"),
        CONSTRAINT "FK_teacher_contract_lessons_teacher" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_contract_lessons_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_contract_lessons_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_teacher_contract_lessons_teacherId" ON "teacher_contract_lessons" ("teacherId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_teacher_contract_lessons_classId" ON "teacher_contract_lessons" ("classId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "teacher_contract_lessons"`);
  }
}
