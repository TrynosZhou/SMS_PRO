/**
 * Script to automatically create the database if it doesn't exist
 * Usage: node scripts/create-database.js
 * 
 * This script connects to PostgreSQL and creates the sms_db database
 * if it doesn't already exist.
 */

require('dotenv').config();
const { Client } = require('pg');

async function createDatabase() {
  // Connect to default 'postgres' database to create our database
  const adminClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres' // Connect to default database
  });

  const dbName = process.env.DB_NAME || 'sms_db';

  try {
    console.log('Connecting to PostgreSQL...');
    await adminClient.connect();
    console.log('Connected successfully!');

    // Check if database exists
    const result = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rows.length > 0) {
      console.log(`Database '${dbName}' already exists.`);
    } else {
      // Create the database
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database '${dbName}' created successfully!`);
    }

    await adminClient.end();
    console.log('\n✅ Database setup complete!');
    console.log('You can now start the backend server with: npm run dev');
  } catch (error) {
    console.error('❌ Error creating database:', error.message);
    
    if (error.code === '28P01') {
      console.error('\n💡 Authentication failed. Please check:');
      console.error('   - DB_USERNAME in .env file');
      console.error('   - DB_PASSWORD in .env file');
      console.error('   - PostgreSQL credentials are correct');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Connection refused. Please check:');
      console.error('   - PostgreSQL service is running');
      console.error('   - DB_HOST and DB_PORT in .env file');
    } else if (error.code === '3D000') {
      console.error('\n💡 Cannot connect to default database. Please check PostgreSQL installation.');
    }
    
    process.exit(1);
  }
}

// Run the script
createDatabase();

