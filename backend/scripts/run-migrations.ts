import { AppDataSource } from '../src/config/database';

async function runMigrations() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();
    console.log('✓ Database connected');

    console.log('Running pending migrations...');
    const migrations = await AppDataSource.runMigrations();
    
    if (migrations.length === 0) {
      console.log('✓ No pending migrations');
    } else {
      console.log(`✓ Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach((migration, index) => {
        console.log(`  ${index + 1}. ${migration.name}`);
      });
    }

    await AppDataSource.destroy();
    console.log('✓ Database connection closed');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running migrations:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigrations();

