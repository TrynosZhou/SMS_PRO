import { AppDataSource } from '../config/database';

export async function ensurePaymentAuditLogTable(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const tableExists = await AppDataSource.query(
    `SELECT to_regclass('public.payment_audit_logs') AS table_exists`
  );

  const exists = !!tableExists?.[0]?.table_exists;

  // Validate column casing against TypeORM entity mapping (camelCase uses quoted identifiers).
  if (exists) {
    const cols: Array<{ column_name: string }> = await AppDataSource.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payment_audit_logs'
    `);
    const colSet = new Set((cols || []).map(c => c.column_name));
    const expected = [
      'eventAt',
      'paymentMethod',
      'amountPaid',
      'eventType',
      'createdAt',
      'lastName',
      'firstName',
      'studentNumber',
      'anomalyMessage',
      'referenceNumber',
      'anomaly',
      'userId',
      'studentId'
    ];
    const missing = expected.filter(e => !colSet.has(e));
    if (missing.length === 0) return;

    // If table exists with incorrect column casing, recreate it to match entity mapping.
    await AppDataSource.query(`DROP TABLE IF EXISTS payment_audit_logs`);
  }

  await AppDataSource.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS payment_audit_logs (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      username varchar NOT NULL,
      "studentId" uuid NOT NULL,
      "studentNumber" varchar NULL,
      "lastName" varchar NULL,
      "firstName" varchar NULL,
      "paymentId" uuid NULL,
      "invoiceId" uuid NULL,
      "amountPaid" decimal(10,2) NOT NULL,
      "paymentMethod" varchar NOT NULL,
      "referenceNumber" varchar NULL,
      "eventAt" timestamp NOT NULL,
      "eventType" varchar NOT NULL DEFAULT 'create',
      anomaly boolean NOT NULL DEFAULT false,
      "anomalyMessage" text NULL,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_AUDIT_LOGS_STUDENTID"
      ON payment_audit_logs ("studentId");
    CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_AUDIT_LOGS_REFERENCENUMBER"
      ON payment_audit_logs ("referenceNumber");
    CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_AUDIT_LOGS_EVENTAT"
      ON payment_audit_logs ("eventAt");
  `);
}

