import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateTeacherClassesJunctionTable1764000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasTable('teacher_classes');
    if (!has) {
      await queryRunner.createTable(
        new Table({
          name: 'teacher_classes',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()'
            },
            {
              name: 'teacherId',
              type: 'uuid',
              isNullable: false
            },
            {
              name: 'classId',
              type: 'uuid',
              isNullable: false
            }
          ]
        }),
        true
      );
    }

    // Idempotent constraints (avoid failed ALTER in transaction — PG aborts whole txn)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class r ON c.conrelid = r.oid
          JOIN pg_namespace n ON r.relnamespace = n.oid
          WHERE n.nspname = 'public' AND r.relname = 'teacher_classes' AND c.conname = 'UQ_teacher_classes_teacher_class'
        ) THEN
          ALTER TABLE "teacher_classes" ADD CONSTRAINT "UQ_teacher_classes_teacher_class" UNIQUE ("teacherId", "classId");
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_teacher_classes_teacherId" ON "teacher_classes" ("teacherId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_teacher_classes_classId" ON "teacher_classes" ("classId")`
    );

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class r ON c.conrelid = r.oid
          JOIN pg_namespace n ON r.relnamespace = n.oid
          WHERE n.nspname = 'public' AND r.relname = 'teacher_classes' AND c.conname = 'FK_teacher_classes_teacher'
        ) THEN
          ALTER TABLE "teacher_classes" ADD CONSTRAINT "FK_teacher_classes_teacher" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class r ON c.conrelid = r.oid
          JOIN pg_namespace n ON r.relnamespace = n.oid
          WHERE n.nspname = 'public' AND r.relname = 'teacher_classes' AND c.conname = 'FK_teacher_classes_class'
        ) THEN
          ALTER TABLE "teacher_classes" ADD CONSTRAINT "FK_teacher_classes_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    console.log('✓ Created teacher_classes junction table');
    console.log('✓ Added unique constraint on (teacherId, classId)');
    console.log('✓ Added indexes and foreign keys');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('teacher_classes', 'FK_teacher_classes_class');
    await queryRunner.dropForeignKey('teacher_classes', 'FK_teacher_classes_teacher');

    await queryRunner.dropIndex('teacher_classes', 'IDX_teacher_classes_classId');
    await queryRunner.dropIndex('teacher_classes', 'IDX_teacher_classes_teacherId');

    await queryRunner.dropUniqueConstraint('teacher_classes', 'UQ_teacher_classes_teacher_class');

    await queryRunner.dropTable('teacher_classes');

    console.log('✓ Dropped teacher_classes junction table');
  }
}
