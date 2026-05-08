import { AppDataSource } from '../config/database';

export async function ensureUserActivityLogTable(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  // Check whether the table exists
  const tableExists = await AppDataSource.query(
    `SELECT to_regclass('public.user_activity_logs') AS table_exists`
  );

  if (tableExists?.[0]?.table_exists) {
    return;
  }

  // Create table on-demand. We keep the column names quoted to match TypeORM mappings.
  await AppDataSource.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS user_activity_logs (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "username" varchar NOT NULL,
      "role" varchar NOT NULL,
      "loginAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "logoutAt" timestamp NULL,
      "menusAccessed" text NULL,
      "lastMenuAccessed" varchar NULL,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "IDX_USER_ACTIVITY_LOGS_USERID"
      ON user_activity_logs ("userId");

    CREATE INDEX IF NOT EXISTS "IDX_USER_ACTIVITY_LOGS_LOGINAT"
      ON user_activity_logs ("loginAt");
  `);
}

