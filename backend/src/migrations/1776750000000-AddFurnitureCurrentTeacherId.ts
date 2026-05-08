import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';
import { safeCreateForeignKey } from '../utils/migrationHelpers';

export class AddFurnitureCurrentTeacherId1776750000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('inventory_furniture_items');
    if (!t?.findColumnByName('currentTeacherId')) {
      await queryRunner.addColumn(
        'inventory_furniture_items',
        new TableColumn({
          name: 'currentTeacherId',
          type: 'uuid',
          isNullable: true,
        })
      );
      await safeCreateForeignKey(
        queryRunner,
        'inventory_furniture_items',
        new TableForeignKey({
          columnNames: ['currentTeacherId'],
          referencedTableName: 'teachers',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('inventory_furniture_items');
    const fk = t?.foreignKeys?.find(f => f.columnNames.includes('currentTeacherId'));
    if (fk) {
      await queryRunner.dropForeignKey('inventory_furniture_items', fk);
    }
    if (t?.findColumnByName('currentTeacherId')) {
      await queryRunner.dropColumn('inventory_furniture_items', 'currentTeacherId');
    }
  }
}
