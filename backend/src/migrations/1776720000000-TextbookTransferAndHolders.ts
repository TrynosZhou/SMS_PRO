import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { safeCreateForeignKey, safeCreateIndex } from '../utils/migrationHelpers';

export class TextbookTransferAndHolders1776720000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add holder columns to textbook copies
    const hasCol = async (tableName: string, colName: string): Promise<boolean> => {
      const t = await queryRunner.getTable(tableName);
      return !!t?.findColumnByName(colName);
    };

    if (!(await hasCol('inventory_textbook_copies', 'currentHodUserId'))) {
      await queryRunner.query(`ALTER TABLE "inventory_textbook_copies" ADD COLUMN "currentHodUserId" uuid NULL`);
      await queryRunner.query(
        `ALTER TABLE "inventory_textbook_copies" ADD CONSTRAINT "FK_inv_textbook_copies_hod_user" FOREIGN KEY ("currentHodUserId") REFERENCES "users"("id") ON DELETE SET NULL`
      );
    }
    if (!(await hasCol('inventory_textbook_copies', 'currentTeacherId'))) {
      await queryRunner.query(`ALTER TABLE "inventory_textbook_copies" ADD COLUMN "currentTeacherId" uuid NULL`);
      await queryRunner.query(
        `ALTER TABLE "inventory_textbook_copies" ADD CONSTRAINT "FK_inv_textbook_copies_teacher" FOREIGN KEY ("currentTeacherId") REFERENCES "teachers"("id") ON DELETE SET NULL`
      );
    }

    // Transfer history table
    await queryRunner.createTable(
      new Table({
        name: 'inventory_textbook_transfers',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'copyId', type: 'uuid' },
          { name: 'fromType', type: 'varchar', length: '16' },
          { name: 'fromUserId', type: 'uuid', isNullable: true },
          { name: 'toType', type: 'varchar', length: '16' },
          { name: 'toUserId', type: 'uuid', isNullable: true },
          { name: 'toTeacherId', type: 'uuid', isNullable: true },
          { name: 'toStudentId', type: 'uuid', isNullable: true },
          { name: 'conditionAtTransfer', type: 'varchar', length: '32', isNullable: true },
          { name: 'authorizedByUserId', type: 'uuid', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await safeCreateIndex(
      queryRunner,
      'inventory_textbook_transfers',
      new TableIndex({ name: 'IDX_inv_textbook_transfers_copy_created', columnNames: ['copyId', 'createdAt'] })
    );

    const fk = async (
      table: string,
      column: string,
      refTable: string,
      refCol: string,
      onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' = 'SET NULL'
    ) => {
      await safeCreateForeignKey(
        queryRunner,
        table,
        new TableForeignKey({
          columnNames: [column],
          referencedTableName: refTable,
          referencedColumnNames: [refCol],
          onDelete,
        })
      );
    };

    await fk('inventory_textbook_transfers', 'copyId', 'inventory_textbook_copies', 'id', 'CASCADE');
    await fk('inventory_textbook_transfers', 'toTeacherId', 'teachers', 'id', 'SET NULL');
    await fk('inventory_textbook_transfers', 'toStudentId', 'students', 'id', 'SET NULL');
    await fk('inventory_textbook_transfers', 'authorizedByUserId', 'users', 'id', 'SET NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort rollback
    await queryRunner.dropTable('inventory_textbook_transfers', true);
    const t = await queryRunner.getTable('inventory_textbook_copies');
    const fkNames =
      t?.foreignKeys
        ?.filter(f => f.columnNames.includes('currentHodUserId') || f.columnNames.includes('currentTeacherId'))
        .map(f => f.name)
        .filter(Boolean) || [];
    for (const name of fkNames) {
      await queryRunner.query(`ALTER TABLE "inventory_textbook_copies" DROP CONSTRAINT "${name}"`);
    }
    if (t?.findColumnByName('currentHodUserId')) {
      await queryRunner.query(`ALTER TABLE "inventory_textbook_copies" DROP COLUMN "currentHodUserId"`);
    }
    if (t?.findColumnByName('currentTeacherId')) {
      await queryRunner.query(`ALTER TABLE "inventory_textbook_copies" DROP COLUMN "currentTeacherId"`);
    }
  }
}

