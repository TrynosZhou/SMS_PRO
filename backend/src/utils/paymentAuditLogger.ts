import { AppDataSource } from '../config/database';
import { PaymentAuditAnomalyType, PaymentAuditEventType, PaymentAuditLog } from '../entities/PaymentAuditLog';
import { Payment } from '../entities/Payment';
import { InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';

type LogPaymentAuditParams = {
  user: { id: string; username: string; role: string };
  student: Student;
  amountPaid: number;
  paymentMethod: string;
  referenceNumber: string | null;
  eventAt: Date;
  eventType: PaymentAuditEventType;
  // optional linkage
  paymentId?: string | null;
  invoiceId?: string | null;
  // anomaly detection inputs
  existingPayment?: Payment | null; // for edits
  previousInvoiceStatus?: InvoiceStatus | null;
  previousInvoiceWasConfirmed?: boolean;
};

function normalizePaymentMethod(method: string): string {
  const m = (method || '').toString().trim().toLowerCase();
  if (!m) return 'cash';
  if (m.includes('ecocash')) return 'ecocash';
  if (m.includes('innbucks')) return 'innbucks';
  if (m.includes('visa')) return 'visa';
  if (m.includes('mastercard')) return 'mastercard';
  if (m.includes('bank_transfer') || m.includes('bank transfer')) return 'bank_transfer';
  if (m.includes('cash')) return 'cash';
  if (m.includes('zig')) return 'cash';
  return m;
}

export async function logPaymentAuditEvent(params: LogPaymentAuditParams): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  // Ensure the table exists even if migrations are skipped.
  await import('./ensurePaymentAuditLogTable').then(m => m.ensurePaymentAuditLogTable());

  const repo = AppDataSource.getRepository(PaymentAuditLog);
  const paymentRepo = AppDataSource.getRepository(Payment);

  const reasons: string[] = [];
  let anomaly = false;

  const eventAt = params.eventAt;
  const now = new Date();

  if (params.amountPaid <= 0) {
    anomaly = true;
    reasons.push(PaymentAuditAnomalyType.INVALID_AMOUNT);
  }

  // Duplicate reference detection (only when referenceNumber is provided)
  if (params.referenceNumber) {
    const reference = params.referenceNumber;
    let duplicatePayment: Payment | null = null;
    try {
      duplicatePayment = await paymentRepo.findOne({
        where: { referenceNumber: reference },
        select: ['id']
      });
    } catch (err: any) {
      // If `payments` table doesn't exist (migration chain failed), skip this check.
      if (err?.code === '42P01') {
        duplicatePayment = null;
      } else {
        throw err;
      }
    }

    // If this is a cash receipt with no payment row, we still check for duplicates in audit logs.
    if (!params.paymentId) {
      const duplicateAudit = await repo.findOne({
        where: { referenceNumber: reference },
        select: ['id'],
        order: { eventAt: 'DESC' }
      });
      if (duplicateAudit) {
        anomaly = true;
        reasons.push(PaymentAuditAnomalyType.DUPLICATE_REFERENCE);
      }
    } else if (duplicatePayment && duplicatePayment.id !== params.paymentId) {
      anomaly = true;
      reasons.push(PaymentAuditAnomalyType.DUPLICATE_REFERENCE);
    }
  }

  // Backdated detection: > 1 day before server now
  if (eventAt < new Date(now.getTime() - 24 * 60 * 60 * 1000)) {
    anomaly = true;
    reasons.push(PaymentAuditAnomalyType.BACKDATED);
  }

  // Edits to previously confirmed payments (approximation)
  if (params.previousInvoiceWasConfirmed) {
    anomaly = true;
    reasons.push(PaymentAuditAnomalyType.EDITED_CONFIRMED);
  }

  const anomalyMessage = anomaly ? reasons.join(', ') : null;

  const log = repo.create({
    userId: params.user.id,
    username: params.user.username,
    studentId: params.student.id,
    studentNumber: (params.student as any).studentNumber || null,
    lastName: (params.student as any).lastName || null,
    firstName: (params.student as any).firstName || null,
    paymentId: params.paymentId ?? null,
    invoiceId: params.invoiceId ?? null,
    amountPaid: params.amountPaid,
    paymentMethod: normalizePaymentMethod(params.paymentMethod),
    referenceNumber: params.referenceNumber,
    eventAt,
    eventType: params.eventType,
    anomaly,
    anomalyMessage,
  });

  await repo.save(log);
}

