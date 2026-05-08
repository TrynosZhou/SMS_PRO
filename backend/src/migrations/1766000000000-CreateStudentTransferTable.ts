import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { safeCreateForeignKey, safeCreateIndex } from '../utils/migrationHelpers';

export class CreateStudentTransferTable1766000000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for transfer type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "student_transfers_transfertype_enum" AS ENUM('internal', 'external');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create student_transfers table
    await queryRunner.createTable(
      new Table({
        name: 'student_transfers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          {
            name: 'studentId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'transferType',
            type: 'enum',
            enumName: 'student_transfers_transfertype_enum',
            default: "'internal'"
          },
          {
            name: 'previousClassId',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'newClassId',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'destinationSchool',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true
          },
          {
            name: 'transferDate',
            type: 'date',
            isNullable: false
          },
          {
            name: 'effectiveDate',
            type: 'date',
            isNullable: true
          },
          {
            name: 'processedByUserId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true
          }
        ]
      }),
      true
    );

    // Create indexes
    await safeCreateIndex(
      queryRunner,
      'student_transfers',
      new TableIndex({
        name: 'IDX_student_transfers_student_date',
        columnNames: ['studentId', 'transferDate']
      })
    );

    await safeCreateIndex(
      queryRunner,
      'student_transfers',
      new TableIndex({
        name: 'IDX_student_transfers_type',
        columnNames: ['transferType']
      })
    );

    await safeCreateIndex(
      queryRunner,
      'student_transfers',
      new TableIndex({
        name: 'IDX_student_transfers_date',
        columnNames: ['transferDate']
      })
    );

    // Create foreign keys
    await safeCreateForeignKey(
      queryRunner,
      'student_transfers',
      new TableForeignKey({
        columnNames: ['studentId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'students',
        onDelete: 'CASCADE'
      })
    );

    await safeCreateForeignKey(
      queryRunner,
      'student_transfers',
      new TableForeignKey({
        columnNames: ['previousClassId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'classes',
        onDelete: 'SET NULL'
      })
    );

    await safeCreateForeignKey(
      queryRunner,
      'student_transfers',
      new TableForeignKey({
        columnNames: ['newClassId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'classes',
        onDelete: 'SET NULL'
      })
    );

    await safeCreateForeignKey(
      queryRunner,
      'student_transfers',
      new TableForeignKey({
        columnNames: ['processedByUserId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT'
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('student_transfers', true);
    await queryRunner.query(`DROP TYPE IF EXISTS "student_transfers_transfertype_enum"`);
  }
}

