import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex, Table } from 'typeorm';
import { safeCreateForeignKey, safeCreateIndex } from '../utils/migrationHelpers';

export class AddSubjectIdToRecordBook1700470000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, drop the old unique index
    const table = await queryRunner.getTable('record_books');
    if (table) {
      const oldIndex = table.indices.find(
        idx => idx.name === 'IDX_record_books_studentId_teacherId_classId_term_year'
      );
      if (oldIndex) {
        await queryRunner.dropIndex('record_books', oldIndex);
        console.log('✓ Dropped old unique index');
      }
    }

    // Check if subjectId column already exists (in case of partial migration)
    const tableCheck = await queryRunner.getTable('record_books');
    const subjectIdColumnExists = tableCheck?.findColumnByName('subjectId');
    
    if (!subjectIdColumnExists) {
      // Add subjectId column as nullable initially
      await queryRunner.addColumn(
        'record_books',
        new TableColumn({
          name: 'subjectId',
          type: 'uuid',
          isNullable: true // Allow null temporarily for migration
        })
      );
      console.log('✓ Added subjectId column to record_books table');
    } else {
      console.log('✓ subjectId column already exists (continuing from partial migration)');
    }

    // Delete existing records without subjectId as they are invalid for subject-specific system
    // This ensures data integrity - old records without subjects cannot be used
    // Note: Use quoted identifier to preserve case sensitivity in PostgreSQL
    try {
      const deleteResult = await queryRunner.query(
        `DELETE FROM record_books WHERE "subjectId" IS NULL`
      );
      // Handle different database result formats
      const deletedCount = deleteResult?.affectedRows || deleteResult?.rowCount || 0;
      console.log(`✓ Cleaned up ${deletedCount} existing records without subjectId`);
    } catch (error: any) {
      // If DELETE fails (e.g., column doesn't exist yet), continue
      if (error.message?.includes('column') && error.message?.includes('subjectId')) {
        console.log('⚠️  No records to clean up (column may not exist yet)');
      } else {
        throw error;
      }
    }

    // Check if foreign key already exists
    const tableForFK = await queryRunner.getTable('record_books');
    const fkExists = tableForFK?.foreignKeys.find(
      fk => fk.name === 'FK_record_books_subject'
    );
    
    if (!fkExists) {
      await safeCreateForeignKey(
        queryRunner,
        'record_books',
        new TableForeignKey({
          columnNames: ['subjectId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'subjects',
          onDelete: 'CASCADE',
          name: 'FK_record_books_subject'
        })
      );
      console.log('✓ Added foreign key constraint for subjectId');
    } else {
      console.log('✓ Foreign key constraint already exists');
    }

    // Now make subjectId required (non-nullable) since we've cleaned up old records
    // Note: changeColumn might not work in all databases, so we'll use ALTER COLUMN
    const tableAfterDelete = await queryRunner.getTable('record_books');
    if (tableAfterDelete) {
      const subjectIdColumn = tableAfterDelete.findColumnByName('subjectId');
      if (subjectIdColumn && subjectIdColumn.isNullable) {
        // First, ensure all records have been deleted (they should be null)
        // Then set NOT NULL
        try {
          await queryRunner.query(`ALTER TABLE record_books ALTER COLUMN "subjectId" SET NOT NULL`);
          console.log('✓ Made subjectId required (non-nullable)');
        } catch (error: any) {
          // If there are still NULL values, delete them first
          if (error.message?.includes('violates not-null constraint') || error.code === '23502') {
            console.log('⚠️  Found NULL values, cleaning up...');
            await queryRunner.query(`DELETE FROM record_books WHERE "subjectId" IS NULL`);
            await queryRunner.query(`ALTER TABLE record_books ALTER COLUMN "subjectId" SET NOT NULL`);
            console.log('✓ Made subjectId required (non-nullable)');
          } else {
            throw error;
          }
        }
      } else if (subjectIdColumn && !subjectIdColumn.isNullable) {
        console.log('✓ subjectId is already NOT NULL');
      }
    }

    // Check if unique index already exists
    const tableForIndex = await queryRunner.getTable('record_books');
    const indexExists = tableForIndex?.indices.find(
      idx => idx.name === 'IDX_record_books_studentId_teacherId_classId_subjectId_term_year'
    );
    
    if (!indexExists) {
      await safeCreateIndex(
        queryRunner,
        'record_books',
        new TableIndex({
          name: 'IDX_record_books_studentId_teacherId_classId_subjectId_term_year',
          columnNames: ['studentId', 'teacherId', 'classId', 'subjectId', 'term', 'year'],
          isUnique: true
        })
      );
      console.log('✓ Created new unique index with subjectId');
    } else {
      console.log('✓ Unique index already exists');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new unique index
    const table = await queryRunner.getTable('record_books');
    if (table) {
      const newIndex = table.indices.find(
        idx => idx.name === 'IDX_record_books_studentId_teacherId_classId_subjectId_term_year'
      );
      if (newIndex) {
        await queryRunner.dropIndex('record_books', newIndex);
        console.log('✓ Dropped new unique index');
      }
    }

    // Drop foreign key
    const foreignKey = table?.foreignKeys.find(
      fk => fk.name === 'FK_record_books_subject'
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('record_books', foreignKey);
      console.log('✓ Dropped foreign key constraint');
    }

    // Remove subjectId column
    await queryRunner.dropColumn('record_books', 'subjectId');
    console.log('✓ Removed subjectId column from record_books table');

    // Recreate old unique index
    await queryRunner.createIndex(
      'record_books',
      new TableIndex({
        name: 'IDX_record_books_studentId_teacherId_classId_term_year',
        columnNames: ['studentId', 'teacherId', 'classId', 'term', 'year'],
        isUnique: true
      })
    );
    console.log('✓ Recreated old unique index');
  }
}

