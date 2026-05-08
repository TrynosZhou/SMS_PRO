/**
 * One-off: add Student entity columns when migrations table is out of sync.
 * Run: node scripts/addStudentProfileColumns.js
 */
require('dotenv').config();
const { Client } = require('pg');

const statements = [
  'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "nationalId" character varying(32)',
  'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "email" character varying(254)',
  'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "dateOfJoining" date',
  'ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "previousSchool" character varying',
];

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const client = url
    ? new Client({ connectionString: url, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false })
    : new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD) : '',
        database: process.env.DB_NAME || 'sms_db',
      });

  await client.connect();
  try {
    for (const q of statements) {
      await client.query(q);
      console.log('Applied:', q);
    }
    console.log('All student profile columns ensured.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
