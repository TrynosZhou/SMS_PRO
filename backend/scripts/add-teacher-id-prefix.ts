import { AppDataSource } from '../src/config/database';

async function addTeacherIdPrefix() {
  try {
    console.log('🔧 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✓ Connected');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    const table = await queryRunner.getTable('settings');
    const hasColumn = table?.columns.find(col => col.name === 'teacherIdPrefix');

    if (hasColumn) {
      console.log('ℹ️ teacherIdPrefix column already exists. Skipping...');
      await queryRunner.release();
      await AppDataSource.destroy();
      return;
    }

    console.log('📋 Adding teacherIdPrefix column to settings table...');
    
    await queryRunner.query(`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS "teacherIdPrefix" VARCHAR(255) DEFAULT 'JPST'
    `);

    // Update existing settings records to have the default value
    await queryRunner.query(`
      UPDATE settings 
      SET "teacherIdPrefix" = 'JPST' 
      WHERE "teacherIdPrefix" IS NULL
    `);

    console.log('✅ teacherIdPrefix column added successfully!');
    
    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('✓ Connection closed');
  } catch (error: any) {
    console.error('❌ Error adding teacherIdPrefix column:', error);
    process.exit(1);
  }
}

addTeacherIdPrefix();

