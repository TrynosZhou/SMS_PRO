import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateETaskTable1771000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasTable('e_tasks');
    if (!has) {
      await queryRunner.createTable(
        new Table({
          name: 'e_tasks',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()'
            },
            { name: 'title', type: 'varchar', isNullable: false },
            { name: 'description', type: 'text', isNullable: true },
            { name: 'taskType', type: 'varchar', length: '20', isNullable: false },
            { name: 'teacherId', type: 'uuid', isNullable: false },
            { name: 'classId', type: 'uuid', isNullable: false },
            { name: 'attachmentUrl', type: 'varchar', isNullable: true },
            { name: 'dueDate', type: 'date', isNullable: true },
            {
              name: 'sentAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false
            }
          ]
        }),
        true
      );
    }

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public' AND tc.table_name = 'e_tasks'
            AND kcu.column_name = 'teacherId' AND tc.constraint_type = 'FOREIGN KEY'
        ) THEN
          ALTER TABLE "e_tasks" ADD CONSTRAINT "FK_e_tasks_teacher" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public' AND tc.table_name = 'e_tasks'
            AND kcu.column_name = 'classId' AND tc.constraint_type = 'FOREIGN KEY'
        ) THEN
          ALTER TABLE "e_tasks" ADD CONSTRAINT "FK_e_tasks_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_E_TASKS_CLASS" ON "e_tasks" ("classId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_E_TASKS_TEACHER" ON "e_tasks" ("teacherId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('e_tasks');
  }
}
