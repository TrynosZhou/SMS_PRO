import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';

async function runMigration() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected');

    console.log('\nRunning pending migrations...');
    const migrations = await AppDataSource.runMigrations();
    
    if (migrations.length === 0) {
      console.log('✓ No pending migrations');
    } else {
      console.log(`✓ Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach(migration => {
        console.log(`  - ${migration.name}`);
      });
    }

    await AppDataSource.destroy();
    console.log('\n✓ Migration completed successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();

