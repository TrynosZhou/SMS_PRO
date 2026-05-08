import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMoreTestsToRecordBook1700410000000 implements MigrationInterface {
  private async columnExists(queryRunner: QueryRunner, columnName: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'record_books'
          AND column_name = $1
        LIMIT 1
      `,
      [columnName]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add test5 through test10 columns
    if (!await this.columnExists(queryRunner, 'test5')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test5',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test5Topic')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test5Topic',
        type: 'varchar',
        length: '100',
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test6')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test6',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test6Topic')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test6Topic',
        type: 'varchar',
        length: '100',
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test7')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test7',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test7Topic')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test7Topic',
        type: 'varchar',
        length: '100',
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test8')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test8',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test8Topic')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test8Topic',
        type: 'varchar',
        length: '100',
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test9')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test9',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test9Topic')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test9Topic',
        type: 'varchar',
        length: '100',
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test10')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test10',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true
      }));
    }

    if (!await this.columnExists(queryRunner, 'test10Topic')) {
      await queryRunner.addColumn('record_books', new TableColumn({
        name: 'test10Topic',
        type: 'varchar',
        length: '100',
        isNullable: true
      }));
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('record_books', 'test10Topic');
    await queryRunner.dropColumn('record_books', 'test10');
    await queryRunner.dropColumn('record_books', 'test9Topic');
    await queryRunner.dropColumn('record_books', 'test9');
    await queryRunner.dropColumn('record_books', 'test8Topic');
    await queryRunner.dropColumn('record_books', 'test8');
    await queryRunner.dropColumn('record_books', 'test7Topic');
    await queryRunner.dropColumn('record_books', 'test7');
    await queryRunner.dropColumn('record_books', 'test6Topic');
    await queryRunner.dropColumn('record_books', 'test6');
    await queryRunner.dropColumn('record_books', 'test5Topic');
    await queryRunner.dropColumn('record_books', 'test5');
  }
}

