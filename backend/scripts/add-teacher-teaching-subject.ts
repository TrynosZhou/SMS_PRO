import { AppDataSource } from '../src/config/database';

async function addTeacherTeachingSubject() {
  try {
    console.log('🔧 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✓ Connected');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    // Check if column already exists
    const table = await queryRunner.getTable('teachers');
    const hasColumn = table?.columns.find(col => col.name === 'teachingSubjectId');

    if (hasColumn) {
      console.log('ℹ️ teachingSubjectId column already exists. Skipping...');
      await queryRunner.release();
      await AppDataSource.destroy();
      return;
    }

    console.log('📋 Adding teachingSubjectId column to teachers table...');
    
    await queryRunner.query(`
      ALTER TABLE teachers 
      ADD COLUMN IF NOT EXISTS "teachingSubjectId" uuid,
      ADD CONSTRAINT "FK_teachers_teaching_subject" 
      FOREIGN KEY ("teachingSubjectId") REFERENCES subjects(id) ON DELETE SET NULL
    `);

    console.log('✅ teachingSubjectId column added successfully!');
    
    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('✓ Connection closed');
  } catch (error: any) {
    console.error('❌ Error adding teachingSubjectId column:', error);
    process.exit(1);
  }
}

addTeacherTeachingSubject();

