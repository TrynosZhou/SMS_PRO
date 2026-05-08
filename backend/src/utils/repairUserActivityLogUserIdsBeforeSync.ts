import { Client } from 'pg';

/** Match `getPostgresSsl` in `config/database.ts` for standalone `pg` connections. */
function getPostgresSsl(connectionHint?: string): false | { rejectUnauthorized: boolean } {
  const hint = (connectionHint || process.env.DB_HOST || '').trim().toLowerCase();
  const flag = (process.env.DB_SSL || '').trim().toLowerCase();
  if (flag === 'false' || flag === '0') {
    return false;
  }
  const useSsl =
    flag === 'true' ||
    flag === '1' ||
    hint.includes('render.com') ||
    hint.includes('amazonaws.com') ||
    hint.includes('neon.tech') ||
    hint.includes('supabase.co');
  if (!useSsl) {
    return false;
  }
  return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
}

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * TypeORM `synchronize` cannot set `user_activity_logs.userId` to NOT NULL while rows have NULL.
 *
 * Common failure mode: legacy column `userid` holds data while TypeORM added a second column `"userId"`
 * (all NULL). `LIMIT 1` on column discovery only fixed one of them — sync still sees NULLs on `"userId"`.
 */
export async function repairUserActivityLogUserIdsBeforeSync(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const ssl = getPostgresSsl(databaseUrl || process.env.DB_HOST);
  const client = databaseUrl
    ? new Client({ connectionString: databaseUrl, ssl })
    : new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD) : '',
        database: process.env.DB_NAME || 'sms_db',
        ssl,
      });

  await client.connect();
  try {
    const reg = await client.query(`SELECT to_regclass('public.user_activity_logs') AS t`);
    if (!reg.rows[0]?.t) {
      return;
    }

    const attr = await client.query<{ attname: string }>(
      `
      SELECT a.attname::text AS attname
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND c.relname = 'user_activity_logs'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND (
          LOWER(a.attname) = 'userid'
          OR LOWER(a.attname) = 'user_id'
        )
      ORDER BY CASE a.attname WHEN 'userId' THEN 0 WHEN 'userid' THEN 1 ELSE 2 END, a.attname
    `
    );

    const names: string[] = [
      ...new Set((attr.rows as { attname: string }[]).map(r => String(r.attname))),
    ];
    if (!names.length) {
      console.warn('[repairUserActivityLog] No user id column on user_activity_logs; skipping');
      return;
    }

    const primary =
      names.find(n => n === 'userId') ||
      names.find(n => n === 'userid') ||
      names.find(n => n === 'user_id') ||
      names[0]!;
    const secondaries: string[] = names.filter(n => n !== primary);
    const pQ = quoteIdent(primary);

    console.log(
      `[repairUserActivityLog] user id columns: ${names.join(', ')} (primary for fix: ${primary})`
    );

    for (const sec of secondaries) {
      const sQ = quoteIdent(sec);
      const merge = await client.query(`
        UPDATE user_activity_logs
        SET ${pQ} = ${sQ}
        WHERE ${pQ} IS NULL AND ${sQ} IS NOT NULL
      `);
      if ((merge.rowCount ?? 0) > 0) {
        console.log(
          `[repairUserActivityLog] Copied ${merge.rowCount} non-null value(s) from ${sec} → ${primary}`
        );
      }
    }

    const upd = await client.query(`
      UPDATE user_activity_logs ual
      SET ${pQ} = u.id
      FROM users u
      WHERE ual.${pQ} IS NULL
        AND ual.username IS NOT NULL
        AND TRIM(ual.username) <> ''
        AND LOWER(TRIM(ual.username)) = LOWER(TRIM(u.username))
    `);
    if ((upd.rowCount ?? 0) > 0) {
      console.log(
        `[repairUserActivityLog] Backfilled ${primary} on ${upd.rowCount} row(s) from users.username`
      );
    }

    const del = await client.query(`DELETE FROM user_activity_logs WHERE ${pQ} IS NULL`);
    if ((del.rowCount ?? 0) > 0) {
      console.warn(
        `[repairUserActivityLog] Deleted ${del.rowCount} row(s) with NULL ${primary} (no matching user)`
      );
    }

    const still = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM user_activity_logs WHERE ${pQ} IS NULL`
    );
    const n = parseInt(still.rows[0]?.c || '0', 10);
    if (n > 0) {
      console.warn(`[repairUserActivityLog] ${n} row(s) still NULL on ${primary} — forcing delete`);
      await client.query(`DELETE FROM user_activity_logs WHERE ${pQ} IS NULL`);
    }
  } finally {
    await client.end();
  }
}
