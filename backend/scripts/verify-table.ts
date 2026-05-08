import { AppDataSource } from '../src/config/database';

async function verifyTable() {
  try {
    await AppDataSource.initialize();
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    const exists = await queryRunner.hasTable('student_transfers');
    console.log('student_transfers table exists:', exists);
    
    if (exists) {
      const result = await queryRunner.query('SELECT COUNT(*) as count FROM student_transfers');
      console.log('Records in table:', result[0].count);
    }
    
    await queryRunner.release();
    await AppDataSource.destroy();
    process.exit(exists ? 0 : 1);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verifyTable();

