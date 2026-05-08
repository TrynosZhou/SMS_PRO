import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function addUniformMarkColumn() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected');

    const queryRunner = AppDataSource.createQueryRunner();
    
    // Check if column already exists
    const table = await queryRunner.getTable('marks');
    const columnExists = table?.findColumnByName('uniformMark');
    
    if (columnExists) {
      console.log('✓ Column "uniformMark" already exists in marks table');
    } else {
      console.log('Adding "uniformMark" column to marks table...');
      await queryRunner.query(`
        ALTER TABLE "marks" 
        ADD COLUMN IF NOT EXISTS "uniformMark" DECIMAL(5,2) NULL
      `);
      console.log('✓ Column "uniformMark" added successfully');
    }

    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('✓ Database connection closed');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error adding column:', error.message);
    console.error(error);
    process.exit(1);
  }
}

addUniformMarkColumn();

