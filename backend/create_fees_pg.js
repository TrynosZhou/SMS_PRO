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
  await client.query(`
    CREATE TABLE IF NOT EXISTS fee_categories (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR NOT NULL,
      description VARCHAR NOT NULL DEFAULT '',
      "sortOrder" INT NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fee_items (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "categoryId"  UUID NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
      "subCategory" VARCHAR NOT NULL,
      "itemName"    VARCHAR NOT NULL,
      amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
      currency      VARCHAR NOT NULL DEFAULT 'USD',
      "sortOrder"   INT NOT NULL DEFAULT 0,
      "createdAt"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query(`
    INSERT INTO fee_categories (name, description, "sortOrder")
    SELECT * FROM (VALUES
      ('O Level Fees'::text, 'Ordinary Level Student Fees'::text, 1::int),
      ('A Level Fees'::text, 'Advanced Level Student Fees'::text, 2::int)
    ) AS v(name, description, "sortOrder")
    WHERE NOT EXISTS (SELECT 1 FROM fee_categories LIMIT 1)
  `);
  console.log('Tables created successfully.');
  await client.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
