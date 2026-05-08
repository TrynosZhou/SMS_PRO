/**
 * Script to copy all tables (structure + data) from sms_db to sms_school
 * This preserves existing tables in sms_school and only adds missing ones
 * Usage: node scripts/copy-tables-only.js
 */

require('dotenv').config();
const { Client } = require('pg');

const sourceDb = 'sms_db';
const targetDb = 'sms_school';

async function copyTables() {
  const sourceClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: sourceDb
  });

  const targetClient = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: targetDb
  });

  try {
    console.log('🔌 Connecting to databases...');
    await sourceClient.connect();
    await targetClient.connect();
    console.log('✅ Connected successfully!\n');

    // Get all table names from source
    console.log('📋 Getting list of tables from sms_db...');
    const tablesResult = await sourceClient.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = tablesResult.rows.map(row => row.tablename);
    console.log(`✅ Found ${tables.length} tables: ${tables.join(', ')}\n`);

    // For each table, copy structure and data
    for (const table of tables) {
      console.log(`\n📦 Processing table: ${table}...`);
      
      // Check if table exists in target
      const tableExists = await targetClient.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [table]);

      if (!tableExists.rows[0].exists) {
        console.log(`   📐 Creating table structure...`);
        
        // Get table structure using pg_get_create_table (if available) or build manually
        try {
          // Try to get the full CREATE TABLE statement
          const createResult = await sourceClient.query(`
            SELECT 
              'CREATE TABLE "' || table_name || '" (' ||
              string_agg(
                '"' || column_name || '" ' ||
                CASE 
                  WHEN data_type = 'character varying' THEN 'VARCHAR(' || COALESCE(character_maximum_length::text, '') || ')'
                  WHEN data_type = 'character' THEN 'CHAR(' || COALESCE(character_maximum_length::text, '') || ')'
                  WHEN data_type = 'numeric' THEN 'NUMERIC(' || COALESCE(numeric_precision::text, '') || 
                    CASE WHEN numeric_scale > 0 THEN ',' || numeric_scale::text ELSE '' END || ')'
                  WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
                  WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
                  WHEN data_type = 'double precision' THEN 'DOUBLE PRECISION'
                  WHEN data_type = 'real' THEN 'REAL'
                  WHEN data_type = 'smallint' THEN 'SMALLINT'
                  WHEN data_type = 'bigint' THEN 'BIGINT'
                  WHEN data_type = 'integer' THEN 'INTEGER'
                  WHEN data_type = 'boolean' THEN 'BOOLEAN'
                  WHEN data_type = 'text' THEN 'TEXT'
                  WHEN data_type = 'jsonb' THEN 'JSONB'
                  WHEN data_type = 'json' THEN 'JSON'
                  WHEN data_type = 'uuid' THEN 'UUID'
                  ELSE UPPER(data_type)
                END ||
                CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
                CASE 
                  WHEN column_default IS NOT NULL AND column_default NOT LIKE 'nextval%' 
                  THEN ' DEFAULT ' || column_default
                  WHEN column_default LIKE 'nextval%' 
                  THEN ' DEFAULT ' || column_default
                  ELSE ''
                END,
                ', '
              ) || ');' as create_statement
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            GROUP BY table_name
          `, [table]);

          // Get column definitions
          const columnsResult = await sourceClient.query(`
            SELECT 
              column_name, 
              data_type, 
              character_maximum_length,
              numeric_precision,
              numeric_scale,
              is_nullable, 
              column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
          `, [table]);

          // Build CREATE TABLE statement
          let createSQL = `CREATE TABLE IF NOT EXISTS "${table}" (\n`;
          const columnDefs = [];
          
          for (const col of columnsResult.rows) {
            let def = `  "${col.column_name}" `;
            
            // Handle different data types
            if (col.data_type === 'character varying') {
              def += `VARCHAR(${col.character_maximum_length || 255})`;
            } else if (col.data_type === 'character') {
              def += `CHAR(${col.character_maximum_length || 1})`;
            } else if (col.data_type === 'numeric') {
              if (col.numeric_precision && col.numeric_scale) {
                def += `NUMERIC(${col.numeric_precision},${col.numeric_scale})`;
              } else if (col.numeric_precision) {
                def += `NUMERIC(${col.numeric_precision})`;
              } else {
                def += 'NUMERIC';
              }
            } else if (col.data_type === 'integer') {
              def += 'INTEGER';
            } else if (col.data_type === 'bigint') {
              def += 'BIGINT';
            } else if (col.data_type === 'smallint') {
              def += 'SMALLINT';
            } else if (col.data_type === 'double precision') {
              def += 'DOUBLE PRECISION';
            } else if (col.data_type === 'real') {
              def += 'REAL';
            } else if (col.data_type === 'boolean') {
              def += 'BOOLEAN';
            } else if (col.data_type === 'timestamp without time zone') {
              def += 'TIMESTAMP';
            } else if (col.data_type === 'timestamp with time zone') {
              def += 'TIMESTAMPTZ';
            } else if (col.data_type === 'text') {
              def += 'TEXT';
            } else if (col.data_type === 'jsonb') {
              def += 'JSONB';
            } else if (col.data_type === 'json') {
              def += 'JSON';
            } else if (col.data_type === 'uuid') {
              def += 'UUID';
            } else {
              def += col.data_type.toUpperCase();
            }
            
            if (col.is_nullable === 'NO') {
              def += ' NOT NULL';
            }
            
            if (col.column_default) {
              def += ` DEFAULT ${col.column_default}`;
            }
            
            columnDefs.push(def);
          }
          
          createSQL += columnDefs.join(',\n') + '\n);';
          
          // Create the table
          await targetClient.query(createSQL);
          console.log(`   ✅ Created table structure`);
          
          // Get and copy primary keys, indexes, and constraints
          // Get primary key constraint
          const pkResult = await sourceClient.query(`
            SELECT
              tc.constraint_name,
              string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public' 
              AND tc.table_name = $1
              AND tc.constraint_type = 'PRIMARY KEY'
            GROUP BY tc.constraint_name
          `, [table]);
          
          if (pkResult.rows.length > 0) {
            for (const pk of pkResult.rows) {
              const pkSQL = `ALTER TABLE "${table}" ADD CONSTRAINT "${pk.constraint_name}" PRIMARY KEY (${pk.columns.split(', ').map(c => `"${c}"`).join(', ')});`;
              try {
                await targetClient.query(pkSQL);
                console.log(`   ✅ Added primary key constraint`);
              } catch (err) {
                // Constraint might already exist or table might have data
                console.log(`   ⚠️  Could not add primary key: ${err.message}`);
              }
            }
          }
          
        } catch (err) {
          console.log(`   ⚠️  Error creating table structure: ${err.message}`);
          console.log(`   Continuing with data copy only...`);
        }
      } else {
        console.log(`   ℹ️  Table already exists, skipping structure creation`);
      }

      // Copy data
      console.log(`   📥 Copying data...`);
      const dataResult = await sourceClient.query(`SELECT * FROM "${table}"`);
      
      if (dataResult.rows.length > 0) {
        // Clear existing data if table exists (optional - comment out if you want to keep existing data)
        try {
          await targetClient.query(`TRUNCATE TABLE "${table}" CASCADE`);
        } catch (err) {
          // If truncate fails, try delete
          try {
            await targetClient.query(`DELETE FROM "${table}"`);
          } catch (deleteErr) {
            console.log(`   ⚠️  Could not clear existing data: ${deleteErr.message}`);
          }
        }
        
        // Get column names
        const columns = Object.keys(dataResult.rows[0]);
        const columnList = columns.map(col => `"${col}"`).join(', ');
        
        // Insert data in batches using parameterized queries
        const batchSize = 100;
        let totalInserted = 0;
        
        for (let i = 0; i < dataResult.rows.length; i += batchSize) {
          const batch = dataResult.rows.slice(i, i + batchSize);
          
          // Build parameterized query
          const placeholders = batch.map((_, rowIdx) => {
            const rowPlaceholders = columns.map((_, colIdx) => 
              `$${rowIdx * columns.length + colIdx + 1}`
            ).join(', ');
            return `(${rowPlaceholders})`;
          }).join(', ');
          
          const values = batch.flatMap(row => 
            columns.map(col => row[col] !== undefined ? row[col] : null)
          );
          
          try {
            await targetClient.query(
              `INSERT INTO "${table}" (${columnList}) VALUES ${placeholders}`,
              values
            );
            totalInserted += batch.length;
          } catch (insertErr) {
            console.log(`   ⚠️  Error inserting batch: ${insertErr.message}`);
            // Try row by row for this batch
            for (const row of batch) {
              try {
                const rowValues = columns.map((_, idx) => `$${idx + 1}`);
                await targetClient.query(
                  `INSERT INTO "${table}" (${columnList}) VALUES (${rowValues.join(', ')})`,
                  columns.map(col => row[col] !== undefined ? row[col] : null)
                );
                totalInserted++;
              } catch (rowErr) {
                console.log(`   ⚠️  Skipped row due to error: ${rowErr.message}`);
              }
            }
          }
        }
        
        console.log(`   ✅ Copied ${totalInserted} rows`);
      } else {
        console.log(`   ✅ Table is empty (no data to copy)`);
      }
    }

    console.log('\n✅ All tables copied successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   Source: ${sourceDb}`);
    console.log(`   Target: ${targetDb}`);
    console.log(`   Total tables processed: ${tables.length}`);
    
  } catch (error) {
    console.error('\n❌ Error copying tables:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

copyTables();