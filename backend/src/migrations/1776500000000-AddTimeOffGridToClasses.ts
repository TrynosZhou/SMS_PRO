import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTimeOffGridToClasses1776500000000 implements MigrationInterface {
  name = 'AddTimeOffGridToClasses1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('classes');
    if (!table?.findColumnByName('timeOffGrid')) {
      await queryRunner.addColumn(
        'classes',
        new TableColumn({
          name: 'timeOffGrid',
          type: 'json',
          isNullable: true,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('classes');
    if (table?.findColumnByName('timeOffGrid')) {
      await queryRunner.dropColumn('classes', 'timeOffGrid');
    }
  }
}
