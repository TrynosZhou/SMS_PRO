import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'schooldb',
  ssl: false,
});

async function run() {
  await ds.initialize();
  await ds.query(`
    CREATE TABLE IF NOT EXISTS fee_categories (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR NOT NULL,
      description VARCHAR NOT NULL DEFAULT '',
      "sortOrder" INT NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ds.query(`
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
  await ds.query(`
    INSERT INTO fee_categories (name, description, "sortOrder")
    VALUES
      ('O Level Fees', 'Ordinary Level Student Fees', 1),
      ('A Level Fees', 'Advanced Level Student Fees', 2)
    ON CONFLICT DO NOTHING
  `);
  console.log('fee_categories and fee_items tables created successfully.');
  await ds.destroy();
}

run().catch(e => { console.error(e.message); process.exit(1); });
