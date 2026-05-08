import { AppDataSource } from '../config/database';

export async function ensurePaymentsTable(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  // If the table exists, do nothing.
  const tableExists = await AppDataSource.query(
    `SELECT to_regclass('public.payments') AS table_exists`
  );
  if (tableExists?.[0]?.table_exists) return;

  await AppDataSource.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'payments_paymentmethod_enum'
      ) THEN
        CREATE TYPE payments_paymentmethod_enum AS ENUM('cash', 'ecocash', 'innbucks', 'visa', 'mastercard', 'bank_transfer');
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'payments_status_enum'
      ) THEN
        CREATE TYPE payments_status_enum AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS payments (
      id uuid NOT NULL DEFAULT uuid_generate_v4(),
      "invoiceId" uuid NOT NULL,
      "studentId" uuid NOT NULL,
      amount decimal(10,2) NOT NULL,
      "paymentMethod" payments_paymentmethod_enum NOT NULL DEFAULT 'cash',
      status payments_status_enum NOT NULL DEFAULT 'pending',
      "transactionId" varchar,
      "referenceNumber" varchar,
      "paymentDetails" text,
      "gatewayResponse" text,
      "processedAt" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PK_payments_id" PRIMARY KEY (id)
    );

    CREATE INDEX IF NOT EXISTS "IDX_PAYMENTS_INVOICE" ON payments ("invoiceId");
    CREATE INDEX IF NOT EXISTS "IDX_PAYMENTS_STUDENT" ON payments ("studentId");
    CREATE INDEX IF NOT EXISTS "IDX_PAYMENTS_TRANSACTION" ON payments ("transactionId");
    CREATE INDEX IF NOT EXISTS "IDX_PAYMENTS_STATUS" ON payments ("status");
  `);
}

