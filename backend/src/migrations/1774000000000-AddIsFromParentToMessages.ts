import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsFromParentToMessages1774000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('messages');
    const columnExists = table?.findColumnByName('isFromParent');

    if (!columnExists) {
      await queryRunner.addColumn(
        'messages',
        new TableColumn({
          name: 'isFromParent',
          type: 'boolean',
          default: false,
          isNullable: false,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('messages');
    if (table?.findColumnByName('isFromParent')) {
      await queryRunner.dropColumn('messages', 'isFromParent');
    }
  }
}
