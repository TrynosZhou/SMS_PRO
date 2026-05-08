const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'schooldb',
});

async function run() {
  await client.connect();

  // Keep only the oldest row per name, delete the rest
  await client.query(`
    DELETE FROM fee_categories
    WHERE id NOT IN (
      SELECT DISTINCT ON (name) id
      FROM fee_categories
      ORDER BY name, "createdAt" ASC
    )
  `);

  // Add unique constraint on name to prevent future duplicates
  await client.query(`
    ALTER TABLE fee_categories
    DROP CONSTRAINT IF EXISTS uq_fee_categories_name
  `);
  await client.query(`
    ALTER TABLE fee_categories
    ADD CONSTRAINT uq_fee_categories_name UNIQUE (name)
  `);

  const { rows } = await client.query('SELECT name FROM fee_categories ORDER BY "sortOrder"');
  console.log('Remaining categories:', rows.map(r => r.name).join(', '));
  console.log('Unique constraint added. Done.');
  await client.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
