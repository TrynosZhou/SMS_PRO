/**
 * Wipes public schema, creates tables from TypeORM entities (synchronize),
 * then runs pending migrations. Use for a new local database (e.g. schooldb).
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/fresh-database.ts
 *
 * Requires .env with DB_* or DATABASE_URL and JWT_SECRET.
 */
import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import { Client } from 'pg';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function resetPublicSchema(client: Client): Promise<void> {
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO public');
  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
}

async function main(): Promise<void> {
  const dbName = process.env.DB_NAME || 'postgres';
  const admin = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD) : '',
    database: dbName
  });

  console.log(`[fresh-database] Connecting to database "${dbName}"...`);
  await admin.connect();
  await resetPublicSchema(admin);
  await admin.end();
  console.log('[fresh-database] public schema reset and uuid-ossp ready.');

  process.env.DB_SYNCHRONIZE = 'true';
  const { AppDataSource } = await import('../src/config/database');
  await AppDataSource.initialize();
  console.log(
    `[fresh-database] Synchronize complete (${AppDataSource.entityMetadatas.length} entities).`
  );
  await AppDataSource.destroy();

  const backendRoot = path.join(__dirname, '..');
  console.log('[fresh-database] Running migrations (DB_SYNCHRONIZE=false)...');
  execSync(
    'node --no-experimental-require-module ./node_modules/typeorm/cli-ts-node-commonjs.js migration:run -d src/data-source.ts',
    {
      cwd: backendRoot,
      stdio: 'inherit',
      env: { ...process.env, DB_SYNCHRONIZE: 'false' }
    }
  );

  console.log('[fresh-database] Done. Keep DB_SYNCHRONIZE unset or false in .env for normal dev.');
}

main().catch((e) => {
  console.error('[fresh-database]', e);
  process.exit(1);
});
