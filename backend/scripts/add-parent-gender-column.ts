/**
 * One-off script to add gender column to parents table if missing.
 * Run: npx ts-node scripts/add-parent-gender-column.ts
 */
import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function main() {
  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  try {
    const result = await qr.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'parents' AND column_name = 'gender'
    `);
    if (result.length > 0) {
      console.log('✓ parents.gender column already exists');
      return;
    }
    await qr.query(`ALTER TABLE parents ADD COLUMN gender VARCHAR NULL`);
    console.log('✓ Added parents.gender column successfully');
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
