import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { safeCreateForeignKey, safeCreateIndex } from '../utils/migrationHelpers';

export class InventoryModule1776700000000 implements MigrationInterface {
  /** Enum ALTER + some PG versions disallow `ALTER TYPE ... ADD VALUE` inside a transaction. */
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'users_role_enum' AND e.enumlabel = 'librarian'
        ) THEN
          ALTER TYPE "users_role_enum" ADD VALUE 'librarian';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'users_role_enum' AND e.enumlabel = 'inventory_clerk'
        ) THEN
          ALTER TYPE "users_role_enum" ADD VALUE 'inventory_clerk';
        END IF;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'inventory_settings',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'libraryLoanDaysDefault', type: 'int', default: 14 },
          { name: 'overdueFinePerDay', type: 'decimal', precision: 12, scale: 2, default: 1 },
          { name: 'autoLossDaysAfterDue', type: 'int', default: 30 },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_textbook_catalog',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'title', type: 'varchar', isNullable: false },
          { name: 'isbn', type: 'varchar', isNullable: true },
          { name: 'subject', type: 'varchar', isNullable: true },
          { name: 'gradeLevel', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_textbook_copies',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'catalogId', type: 'uuid', isNullable: false },
          { name: 'assetTag', type: 'varchar', isNullable: true, isUnique: true },
          { name: 'condition', type: 'varchar', length: '32', isNullable: false },
          { name: 'status', type: 'varchar', length: '32', isNullable: false },
          { name: 'currentStudentId', type: 'uuid', isNullable: true },
          { name: 'lostAt', type: 'timestamp', isNullable: true },
          { name: 'accountableStudentId', type: 'uuid', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_furniture_items',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'itemType', type: 'varchar', length: '16', isNullable: false },
          { name: 'itemCode', type: 'varchar', isNullable: false, isUnique: true },
          { name: 'condition', type: 'varchar', length: '32', isNullable: false },
          { name: 'classroomLocation', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar', length: '32', isNullable: false },
          { name: 'currentStudentId', type: 'uuid', isNullable: true },
          { name: 'lostAt', type: 'timestamp', isNullable: true },
          { name: 'accountableStudentId', type: 'uuid', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_textbook_permanent_issues',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'studentId', type: 'uuid', isNullable: false },
          { name: 'copyId', type: 'uuid', isNullable: false },
          { name: 'courseLabel', type: 'varchar', isNullable: true },
          { name: 'issuedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'returnedAt', type: 'timestamp', isNullable: true },
          { name: 'authorizedByUserId', type: 'uuid', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_library_loans',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'studentId', type: 'uuid', isNullable: false },
          { name: 'copyId', type: 'uuid', isNullable: false },
          { name: 'borrowedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'dueAt', type: 'timestamp', isNullable: false },
          { name: 'returnedAt', type: 'timestamp', isNullable: true },
          { name: 'overdueDays', type: 'int', isNullable: true },
          { name: 'authorizedByUserId', type: 'uuid', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_furniture_assignments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'studentId', type: 'uuid', isNullable: false },
          { name: 'deskItemId', type: 'uuid', isNullable: true },
          { name: 'chairItemId', type: 'uuid', isNullable: true },
          { name: 'issuedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'revokedAt', type: 'timestamp', isNullable: true },
          { name: 'authorizedByUserId', type: 'uuid', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_fines',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'studentId', type: 'uuid', isNullable: false },
          { name: 'fineType', type: 'varchar', length: '32', isNullable: false },
          { name: 'amount', type: 'decimal', precision: 12, scale: 2, isNullable: false },
          { name: 'status', type: 'varchar', length: '16', isNullable: false },
          { name: 'libraryLoanId', type: 'uuid', isNullable: true },
          { name: 'furnitureItemId', type: 'uuid', isNullable: true },
          { name: 'textbookCopyId', type: 'uuid', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'recordedByUserId', type: 'uuid', isNullable: true },
          { name: 'paidAt', type: 'timestamp', isNullable: true },
          { name: 'paidRecordedByUserId', type: 'uuid', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_audit_logs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'action', type: 'varchar', length: '64', isNullable: false },
          { name: 'entityType', type: 'varchar', length: '64', isNullable: false },
          { name: 'entityId', type: 'varchar', length: '64', isNullable: false },
          { name: 'studentId', type: 'uuid', isNullable: true },
          { name: 'performedByUserId', type: 'uuid', isNullable: true },
          { name: 'payload', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    const fk = async (
      table: string,
      column: string,
      refTable: string,
      onDelete: 'CASCADE' | 'SET NULL' = 'CASCADE'
    ) =>
      safeCreateForeignKey(
        queryRunner,
        table,
        new TableForeignKey({
          columnNames: [column],
          referencedTableName: refTable,
          referencedColumnNames: ['id'],
          onDelete,
        })
      );

    await fk('inventory_textbook_copies', 'catalogId', 'inventory_textbook_catalog');
    await fk('inventory_textbook_copies', 'currentStudentId', 'students', 'SET NULL');
    await fk('inventory_textbook_copies', 'accountableStudentId', 'students', 'SET NULL');

    await fk('inventory_furniture_items', 'currentStudentId', 'students', 'SET NULL');
    await fk('inventory_furniture_items', 'accountableStudentId', 'students', 'SET NULL');

    await fk('inventory_textbook_permanent_issues', 'studentId', 'students');
    await fk('inventory_textbook_permanent_issues', 'copyId', 'inventory_textbook_copies');
    await fk('inventory_textbook_permanent_issues', 'authorizedByUserId', 'users', 'SET NULL');

    await fk('inventory_library_loans', 'studentId', 'students');
    await fk('inventory_library_loans', 'copyId', 'inventory_textbook_copies');
    await fk('inventory_library_loans', 'authorizedByUserId', 'users', 'SET NULL');

    await fk('inventory_furniture_assignments', 'studentId', 'students');
    await fk('inventory_furniture_assignments', 'deskItemId', 'inventory_furniture_items', 'SET NULL');
    await fk('inventory_furniture_assignments', 'chairItemId', 'inventory_furniture_items', 'SET NULL');
    await fk('inventory_furniture_assignments', 'authorizedByUserId', 'users', 'SET NULL');

    await fk('inventory_fines', 'studentId', 'students');
    await fk('inventory_fines', 'libraryLoanId', 'inventory_library_loans', 'SET NULL');
    await fk('inventory_fines', 'furnitureItemId', 'inventory_furniture_items', 'SET NULL');
    await fk('inventory_fines', 'textbookCopyId', 'inventory_textbook_copies', 'SET NULL');
    await fk('inventory_fines', 'recordedByUserId', 'users', 'SET NULL');
    await fk('inventory_fines', 'paidRecordedByUserId', 'users', 'SET NULL');

    await fk('inventory_audit_logs', 'studentId', 'students', 'SET NULL');
    await fk('inventory_audit_logs', 'performedByUserId', 'users', 'SET NULL');

    await safeCreateIndex(
      queryRunner,
      'inventory_textbook_copies',
      new TableIndex({ name: 'IDX_inv_copy_catalog_status', columnNames: ['catalogId', 'status'] })
    );
    await safeCreateIndex(
      queryRunner,
      'inventory_library_loans',
      new TableIndex({ name: 'IDX_inv_loan_copy_open', columnNames: ['copyId', 'returnedAt'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('inventory_audit_logs', true);
    await queryRunner.dropTable('inventory_fines', true);
    await queryRunner.dropTable('inventory_furniture_assignments', true);
    await queryRunner.dropTable('inventory_library_loans', true);
    await queryRunner.dropTable('inventory_textbook_permanent_issues', true);
    await queryRunner.dropTable('inventory_textbook_copies', true);
    await queryRunner.dropTable('inventory_furniture_items', true);
    await queryRunner.dropTable('inventory_textbook_catalog', true);
    await queryRunner.dropTable('inventory_settings', true);
    // users_role_enum values librarian/inventory_clerk are left in place
  }
}
