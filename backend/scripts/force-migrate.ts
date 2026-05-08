import { AppDataSource } from '../src/config/database';

async function forceMigrate() {
  let dataSource: any = null;
  
  try {
    console.log('🔧 Initializing database connection...');
    dataSource = AppDataSource;
    
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
      console.log('✓ Database connected');
    } else {
      console.log('✓ Database already initialized');
    }

    console.log('🚀 Running pending migrations...\n');

    // Run migrations - this will only run pending ones
    const migrations = await dataSource.runMigrations();
    
    if (migrations.length === 0) {
      console.log('⚠️ No migrations were executed');
    } else {
      console.log(`\n✅ Successfully ran ${migrations.length} migration(s):\n`);
      migrations.forEach((migration: any, index: number) => {
        console.log(`  ${index + 1}. ${migration.name}`);
      });
      console.log('\n✓ All migrations completed successfully!');
    }

    // Close connection properly
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('✓ Database connection closed');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error running migrations:');
    console.error('Message:', error.message);
    
    if (error.code) {
      console.error('Error code:', error.code);
    }
    
    if (error.query) {
      console.error('Failed query:', error.query);
    }
    
    // Try to close connection even on error
    if (dataSource && dataSource.isInitialized) {
      try {
        await dataSource.destroy();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n⚠️ Migration interrupted by user');
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️ Migration terminated');
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});

forceMigrate();

