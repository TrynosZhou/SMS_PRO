import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUniformMarkToMarks1768000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists
    const table = await queryRunner.getTable('marks');
    const columnExists = table?.findColumnByName('uniformMark');
    
    if (!columnExists) {
      // Add uniformMark column to marks table
      await queryRunner.addColumn(
        'marks',
        new TableColumn({
          name: 'uniformMark',
          type: 'decimal',
          precision: 5,
          scale: 2,
          isNullable: true,
          default: null,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove uniformMark column from marks table
    await queryRunner.dropColumn('marks', 'uniformMark');
  }
}

