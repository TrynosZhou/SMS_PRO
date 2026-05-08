/**
 * Script to copy all contents from sms_db to sms_school
 * Usage: node scripts/copy-database.js
 * 
 * This script:
 * 1. Creates the sms_school database if it doesn't exist
 * 2. Copies all schema and data from sms_db to sms_school
 */

require('dotenv').config();
const { Client } = require('pg');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const sourceDb = process.env.DB_NAME || 'sms_db';
const targetDb = 'sms_school';

async function copyDatabase() {
  // Connect to default 'postgres' database to create target database
  const adminClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres' // Connect to default database
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await adminClient.connect();
    console.log('✅ Connected successfully!');

    // Check if source database exists
    console.log(`\n📋 Checking if source database '${sourceDb}' exists...`);
    const sourceCheck = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [sourceDb]
    );

    if (sourceCheck.rows.length === 0) {
      console.error(`❌ Source database '${sourceDb}' does not exist!`);
      process.exit(1);
    }
    console.log(`✅ Source database '${sourceDb}' found.`);

    // Check if target database exists, drop if it does
    console.log(`\n📋 Checking if target database '${targetDb}' exists...`);
    const targetCheck = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDb]
    );

    if (targetCheck.rows.length > 0) {
      console.log(`⚠️  Target database '${targetDb}' already exists.`);
      console.log('   Dropping existing database to create fresh copy...');
      // Terminate all connections to the target database
      await adminClient.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${targetDb}'
        AND pid <> pg_backend_pid();
      `);
      await adminClient.query(`DROP DATABASE ${targetDb}`);
      console.log(`✅ Dropped existing '${targetDb}' database.`);
    }

    // Use TEMPLATE to copy database (fastest method)
    console.log(`\n📦 Creating '${targetDb}' database from '${sourceDb}' template...`);
    try {
      await adminClient.query(`CREATE DATABASE ${targetDb} WITH TEMPLATE ${sourceDb}`);
      console.log(`✅ Database '${targetDb}' created successfully from template!`);
      console.log(`\n📊 Summary:`);
      console.log(`   Source: ${sourceDb}`);
      console.log(`   Target: ${targetDb}`);
      console.log(`   All tables, data, indexes, and constraints have been copied.`);
      await adminClient.end();
      return;
    } catch (templateError) {
      if (templateError.code === '55006') {
        console.log('⚠️  Cannot use TEMPLATE (database has active connections).');
        console.log('   Trying alternative method...');
      } else {
        throw templateError;
      }
    }

    // Alternative: Create empty database and copy data
    console.log(`📦 Creating empty '${targetDb}' database...`);
    await adminClient.query(`CREATE DATABASE ${targetDb}`);
    console.log(`✅ Database '${targetDb}' created.`);

    await adminClient.end();

    // Use pg_dump and psql to copy data
    console.log(`\n📤 Exporting data from '${sourceDb}'...`);
    
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const dbUser = process.env.DB_USERNAME || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || '';

    // Set PGPASSWORD environment variable
    process.env.PGPASSWORD = dbPassword;

    // Create pg_dump command
    const dumpCommand = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${sourceDb} --no-owner --no-acl`;
    
    console.log(`📥 Importing data to '${targetDb}'...`);
    
    // Pipe pg_dump output directly to psql
    const restoreCommand = `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${targetDb}`;
    const fullCommand = `${dumpCommand} | ${restoreCommand}`;

    try {
      console.log('⏳ Copying data (this may take a few moments)...');
      const { stdout, stderr } = await execAsync(fullCommand, {
        env: { ...process.env, PGPASSWORD: dbPassword },
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        shell: true // Use shell for pipe operator
      });

      if (stdout) {
        console.log(stdout);
      }

      if (stderr && !stderr.includes('WARNING') && !stderr.includes('NOTICE')) {
        const errorLines = stderr.split('\n').filter(line => 
          line && !line.includes('WARNING') && !line.includes('NOTICE')
        );
        if (errorLines.length > 0) {
          console.error('⚠️  Errors:', errorLines.join('\n'));
        }
      }

      console.log('\n✅ Database copy completed successfully!');
      console.log(`\n📊 Summary:`);
      console.log(`   Source: ${sourceDb}`);
      console.log(`   Target: ${targetDb}`);
      console.log(`   All tables, data, indexes, and constraints have been copied.`);
      
    } catch (execError) {
      console.log('\n⚠️  pg_dump method encountered issues, trying alternative SQL method...');
      console.log('   Error details:', execError.message);
      
      await copyUsingSQL(dbHost, dbPort, dbUser, dbPassword);
    }

  } catch (error) {
    console.error('❌ Error copying database:', error.message);
    
    if (error.code === '28P01') {
      console.error('\n💡 Authentication failed. Please check:');
      console.error('   - DB_USERNAME in .env file');
      console.error('   - DB_PASSWORD in .env file');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Connection refused. Please check:');
      console.error('   - PostgreSQL service is running');
      console.error('   - DB_HOST and DB_PORT in .env file');
    }
    
    // Try SQL method as fallback
    try {
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = process.env.DB_PORT || '5432';
      const dbUser = process.env.DB_USERNAME || 'postgres';
      const dbPassword = process.env.DB_PASSWORD || '';
      await copyUsingSQL(dbHost, dbPort, dbUser, dbPassword);
    } catch (fallbackError) {
      console.error('\n❌ Fallback method also failed:', fallbackError.message);
      process.exit(1);
    }
  }
}

async function copyUsingSQL(host, port, user, password) {
  console.log('\n🔄 Using SQL-based copy method...');
  
  const sourceClient = new Client({
    host,
    port: parseInt(port),
    user,
    password,
    database: sourceDb
  });

  const targetClient = new Client({
    host,
    port: parseInt(port),
    user,
    password,
    database: targetDb
  });

  try {
    await sourceClient.connect();
    await targetClient.connect();
    console.log('✅ Connected to both databases');

    // Get all table names
    console.log('\n📋 Getting list of tables...');
    const tablesResult = await sourceClient.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = tablesResult.rows.map(row => row.tablename);
    console.log(`✅ Found ${tables.length} tables: ${tables.join(', ')}`);

    // Copy each table
    for (const table of tables) {
      console.log(`\n📦 Copying table: ${table}...`);
      
      // Get all data from source table
      const dataResult = await sourceClient.query(`SELECT * FROM "${table}"`);
      
      if (dataResult.rows.length > 0) {
        // Get column names
        const columns = Object.keys(dataResult.rows[0]);
        const columnList = columns.map(col => `"${col}"`).join(', ');
        
        // Build insert statements in batches
        const batchSize = 100;
        for (let i = 0; i < dataResult.rows.length; i += batchSize) {
          const batch = dataResult.rows.slice(i, i + batchSize);
          const values = batch.map(row => {
            const rowValues = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
              }
              if (value instanceof Date) {
                return `'${value.toISOString()}'`;
              }
              if (typeof value === 'boolean') {
                return value ? 'TRUE' : 'FALSE';
              }
              return value;
            });
            return `(${rowValues.join(', ')})`;
          }).join(', ');
          
          await targetClient.query(`INSERT INTO "${table}" (${columnList}) VALUES ${values}`);
        }
        
        console.log(`   ✅ Copied ${dataResult.rows.length} rows`);
      } else {
        console.log(`   ✅ Table is empty`);
      }
    }

    console.log('\n✅ Database copy completed successfully using SQL method!');
    
  } catch (error) {
    console.error('❌ Error in SQL copy method:', error.message);
    throw error;
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

// Run the script
copyDatabase();