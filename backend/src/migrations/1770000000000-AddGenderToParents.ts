import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGenderToParents1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('parents');
    const columnExists = table?.findColumnByName('gender');

    if (!columnExists) {
      await queryRunner.addColumn(
        'parents',
        new TableColumn({
          name: 'gender',
          type: 'varchar',
          isNullable: true,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('parents');
    if (table?.findColumnByName('gender')) {
      await queryRunner.dropColumn('parents', 'gender');
    }
  }
}
