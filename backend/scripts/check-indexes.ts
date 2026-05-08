import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function checkIndexes() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected\n');

    const queryRunner = AppDataSource.createQueryRunner();
    
    // Check indexes on teachers table
    const indexes = await queryRunner.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'teachers'
      ORDER BY indexname;
    `);
    
    console.log('Indexes on teachers table:');
    console.log('==========================');
    indexes.forEach((idx: any) => {
      console.log(`\nIndex: ${idx.indexname}`);
      console.log(`Definition: ${idx.indexdef}`);
    });
    
    // Check columns on teachers table
    const columns = await queryRunner.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'teachers'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n\nColumns on teachers table:');
    console.log('==========================');
    columns.forEach((col: any) => {
      console.log(`${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable}`);
    });
    
    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('\n✓ Check completed');
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Check failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkIndexes();

