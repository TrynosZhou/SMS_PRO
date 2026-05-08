import { AppDataSource } from '../src/config/database';

async function addGradePointsColumn() {
  try {
    console.log('🔧 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✓ Connected');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    const table = await queryRunner.getTable('settings');
    const hasColumn = table?.columns.find(col => col.name === 'gradePoints');

    if (hasColumn) {
      console.log('ℹ️ gradePoints column already exists. Skipping...');
      await queryRunner.release();
      await AppDataSource.destroy();
      return;
    }

    console.log('📋 Adding gradePoints column to settings table...');

    await queryRunner.query(`
      ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS "gradePoints" JSONB NULL
    `);

    console.log('✅ gradePoints column added successfully!');

    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('✓ Connection closed');
  } catch (error: any) {
    console.error('❌ Error adding gradePoints column:', error);
    process.exit(1);
  }
}

addGradePointsColumn();

