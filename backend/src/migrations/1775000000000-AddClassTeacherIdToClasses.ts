import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';
import { safeCreateForeignKey } from '../utils/migrationHelpers';

export class AddClassTeacherIdToClasses1775000000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const classes = await queryRunner.getTable('classes');
    if (!classes?.findColumnByName('classTeacherId')) {
      await queryRunner.addColumn(
        'classes',
        new TableColumn({
          name: 'classTeacherId',
          type: 'uuid',
          isNullable: true,
        })
      );
    }
    await safeCreateForeignKey(
      queryRunner,
      'classes',
      new TableForeignKey({
        columnNames: ['classTeacherId'],
        referencedTableName: 'teachers',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('classes');
    const fk = table?.foreignKeys.find((f) => f.columnNames.includes('classTeacherId'));
    if (fk) {
      await queryRunner.dropForeignKey('classes', fk);
    }
    await queryRunner.dropColumn('classes', 'classTeacherId');
  }
}
