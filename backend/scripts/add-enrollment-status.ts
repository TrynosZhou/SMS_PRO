import { AppDataSource } from '../src/config/database';

async function addEnrollmentStatus() {
  try {
    console.log('🔧 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✓ Connected');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    // Check if column already exists
    const table = await queryRunner.getTable('students');
    const hasColumn = table?.columns.find(col => col.name === 'enrollmentStatus');

    if (hasColumn) {
      console.log('ℹ️ enrollmentStatus column already exists. Skipping...');
      await queryRunner.release();
      await AppDataSource.destroy();
      return;
    }

    console.log('📋 Adding enrollmentStatus column to students table...');
    
    await queryRunner.query(`
      ALTER TABLE students 
      ADD COLUMN IF NOT EXISTS "enrollmentStatus" VARCHAR(20) DEFAULT 'Not Enrolled'
      CHECK ("enrollmentStatus" IN ('Not Enrolled', 'Enrolled', 'Transferred Out'))
    `);

    // Update existing students: if they have a classId, set status to 'Enrolled'
    console.log('🔄 Updating existing students with classId to "Enrolled" status...');
    await queryRunner.query(`
      UPDATE students 
      SET "enrollmentStatus" = 'Enrolled' 
      WHERE "classId" IS NOT NULL AND "enrollmentStatus" = 'Not Enrolled'
    `);

    console.log('✅ enrollmentStatus column added successfully!');
    
    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('✓ Connection closed');
  } catch (error: any) {
    console.error('❌ Error adding enrollmentStatus column:', error);
    process.exit(1);
  }
}

addEnrollmentStatus();

