import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { safeCreateForeignKey, safeCreateIndex } from '../utils/migrationHelpers';

export class DepartmentsAndTeacherDepartment1776740000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'departments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
    await safeCreateIndex(
      queryRunner,
      'departments',
      new TableIndex({ name: 'UQ_departments_name', columnNames: ['name'], isUnique: true })
    );

    // Add departmentId to teachers
    await queryRunner.query(`ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "departmentId" uuid NULL`);
    await safeCreateForeignKey(
      queryRunner,
      'teachers',
      new TableForeignKey({
        columnNames: ['departmentId'],
        referencedTableName: 'departments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('teachers');
    const fk = t?.foreignKeys?.find((f) => f.columnNames.includes('departmentId'));
    if (fk) {
      await queryRunner.dropForeignKey('teachers', fk);
    }
    await queryRunner.query(`ALTER TABLE "teachers" DROP COLUMN IF EXISTS "departmentId"`);
    await queryRunner.dropTable('departments', true);
  }
}

