import { DataSource } from 'typeorm';
import { Student } from '../entities/Student';
import { Class } from '../entities/Class';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { parseAmount, roundMoney } from './numberUtils';
import { normalizeFeesSettingsObject } from './feesSettingsResolve';
import { buildNewStudentRegistrationInvoice } from './registrationInvoiceBundle';
import {
  applyExemptionForStudent,
  computeManagedFeesForStudent,
} from './managedFeesBilling';
import {
  resolveRegistrationFeesFromCatalog,
  buildMergedFeesSettingsForRegistration,
} from './registrationFeesFromCatalog';
import { getUniformTotalForInvoice } from './invoiceBalanceResolve';

export type OpeningFeeLine = { description: string; amount: number };

export interface OpeningInvoiceBundle {
  total: number;
  feeLineItems: OpeningFeeLine[];
  lineDescriptions: string[];
  source: 'catalog' | 'settings' | 'managed-fallback' | 'none';
}

/**
 * Single source of truth for "what should a new student's opening invoice look like?".
 * Pulls Tuition / Desk Fee / Registration Fee from Finance → Manage → Fees, merges any
 * missing values with Settings → School Fees, applies active fee exemptions, and falls
 * back to the full managed-fees engine if the registration bundle ends up at zero.
 */
export async function computeOpeningInvoiceBundle(
  ds: DataSource,
  student: Student & { classEntity?: Class | null }
): Promise<OpeningInvoiceBundle> {
  const settings = await ds.getRepository(Settings).findOne({
    where: {},
    order: { createdAt: 'DESC' },
  });
  if (!settings) {
    return { total: 0, feeLineItems: [], lineDescriptions: [], source: 'none' };
  }

  const catalogFees = await resolveRegistrationFeesFromCatalog(ds, {
    studentType: String(student.studentType || ''),
    classEntity: student.classEntity ?? null,
  });
  const mergedFeesSettings = buildMergedFeesSettingsForRegistration(
    catalogFees,
    normalizeFeesSettingsObject(settings.feesSettings ?? null) as any
  );

  let { total, feeLineItems, lineDescriptions } = buildNewStudentRegistrationInvoice({
    feesSettings: mergedFeesSettings,
    studentType: String(student.studentType || ''),
    isStaffChild: Boolean(student.isStaffChild),
    usesDiningHall: Boolean(student.usesDiningHall),
  });

  let source: OpeningInvoiceBundle['source'] = catalogFees.hasAny ? 'catalog' : 'settings';

  if (student.id) {
    const bundleLines = feeLineItems.map(l => ({
      description: l.description,
      amount: roundMoney(parseAmount((l as any).amount)),
    }));
    const bundleSum = roundMoney(bundleLines.reduce((s, l) => s + l.amount, 0));
    const applied = await applyExemptionForStudent(ds, student.id, bundleLines, bundleSum);
    feeLineItems = applied.lines.map(l => ({
      description: l.description,
      amount: roundMoney(l.amount),
    })) as typeof feeLineItems;
    total = applied.total;
    lineDescriptions = applied.lines.map(
      l => `${l.description}: ${roundMoney(l.amount)}`
    );
  }

  if (total <= 0.005 && !student.isStaffChild) {
    try {
      const managed = await computeManagedFeesForStudent(ds, student as any, {
        hasPreviousInvoice: false,
        termPeriodType: 'regular',
      });
      if (managed.total > 0.005 && managed.lines.length > 0) {
        total = managed.total;
        feeLineItems = managed.lines.map(l => ({
          description: l.description,
          amount: roundMoney(l.amount),
        })) as typeof feeLineItems;
        lineDescriptions = managed.lines.map(
          l => `${l.description}: ${roundMoney(l.amount)}`
        );
        source = 'managed-fallback';
      }
    } catch (e) {
      // Caller logs as needed; keep bundle as-is when fallback fails.
    }
  }

  if (total <= 0.005) {
    source = 'none';
  }

  return { total: roundMoney(total), feeLineItems, lineDescriptions, source };
}

export interface RebuildOpeningInvoiceResult {
  ok: boolean;
  reason?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  previousAmount?: number;
  newAmount?: number;
  newBalance?: number;
  newStatus?: InvoiceStatus;
  source?: OpeningInvoiceBundle['source'];
  feeLineItems?: OpeningFeeLine[];
}

/**
 * Recalculate the **first/opening** invoice for a student using the current Finance
 * catalog and Settings. Preserves any paidAmount / prepaidAmount / previousBalance,
 * but rewrites amount, feeLineItems, balance and status to match the current rules.
 *
 * Targets either the explicit invoiceId (when supplied) or the student's earliest
 * non-uniform-only invoice that was created via the registration/enrollment flow.
 */
export async function rebuildOpeningInvoiceForStudent(
  ds: DataSource,
  params: {
    studentId?: string;
    studentNumber?: string;
    invoiceId?: string;
  }
): Promise<RebuildOpeningInvoiceResult> {
  const studentRepo = ds.getRepository(Student);
  const invRepo = ds.getRepository(Invoice);

  let student: (Student & { classEntity?: Class | null }) | null = null;

  if (params.studentId) {
    student = await studentRepo.findOne({
      where: { id: params.studentId },
      relations: ['classEntity'],
    });
  } else if (params.studentNumber) {
    student = await studentRepo.findOne({
      where: { studentNumber: params.studentNumber.trim() },
      relations: ['classEntity'],
    });
  } else if (params.invoiceId) {
    const inv = await invRepo.findOne({ where: { id: params.invoiceId } });
    if (inv) {
      student = await studentRepo.findOne({
        where: { id: inv.studentId },
        relations: ['classEntity'],
      });
    }
  }

  if (!student) {
    return { ok: false, reason: 'Student not found' };
  }

  let invoice: Invoice | null = null;
  if (params.invoiceId) {
    invoice = await invRepo.findOne({ where: { id: params.invoiceId } });
    if (invoice && invoice.studentId !== student.id) {
      return { ok: false, reason: 'Invoice does not belong to the resolved student' };
    }
  } else {
    const invoices = await invRepo.find({
      where: { studentId: student.id },
      order: { createdAt: 'ASC' },
    });
    invoice =
      invoices.find(inv => {
        const hasFeeLines =
          Array.isArray((inv as any).feeLineItems) && (inv as any).feeLineItems.length > 0;
        const hasTerm = Boolean(inv.term && String(inv.term).trim());
        return hasFeeLines || hasTerm;
      }) ?? invoices[0] ?? null;
  }

  if (!invoice) {
    return { ok: false, reason: 'No invoice found for this student' };
  }

  const invStatus = String(invoice.status || '').toLowerCase();
  if (invStatus === 'paid') {
    return {
      ok: false,
      reason:
        'Cannot rebuild a fully paid invoice. Use a credit note or manual adjustment if the billed amount was wrong.',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  const bundle = await computeOpeningInvoiceBundle(ds, student);
  if (bundle.total <= 0.005 && bundle.feeLineItems.length === 0) {
    return {
      ok: false,
      reason:
        'Opening invoice total computed as 0 — add Tuition / Desk Fee / Registration Fee under Finance → Manage → Fees first.',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      source: bundle.source,
    };
  }

  const previousAmount = parseAmount(invoice.amount);
  const previousBalance = parseAmount(invoice.previousBalance);
  const paidAmount = parseAmount(invoice.paidAmount);

  const uniformTotal = getUniformTotalForInvoice(invoice);
  const lineSum = bundle.feeLineItems.reduce(
    (s, row) => s + roundMoney(parseAmount((row as any).amount)),
    0
  );
  const termFees = lineSum > 0.005 ? roundMoney(lineSum) : roundMoney(bundle.total);
  const newAmount = roundMoney(termFees + uniformTotal);
  const newGross = roundMoney(previousBalance + newAmount);
  let newBalance = roundMoney(Math.max(0, newGross - paidAmount));

  let newStatus: InvoiceStatus;
  if (newBalance <= 0.001) {
    newStatus = InvoiceStatus.PAID;
  } else if (paidAmount > 0.001) {
    newStatus = InvoiceStatus.PARTIAL;
  } else {
    newStatus = InvoiceStatus.PENDING;
  }
  if (
    invoice.dueDate &&
    new Date() > new Date(invoice.dueDate) &&
    newBalance > 0.001
  ) {
    newStatus = InvoiceStatus.OVERDUE;
  }

  const description =
    invoice.description && String(invoice.description).includes('Enrollment')
      ? bundle.lineDescriptions.length > 0
        ? `Enrollment — new student fees: ${bundle.lineDescriptions.join(', ')}`
        : invoice.description
      : bundle.lineDescriptions.length > 0
        ? `New student registration: ${bundle.lineDescriptions.join(', ')}`
        : invoice.description;

  await invRepo.update(
    { id: invoice.id },
    {
      amount: newAmount,
      balance: newBalance,
      status: newStatus,
      feeLineItems: bundle.feeLineItems as any,
      description,
    }
  );

  return {
    ok: true,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    previousAmount: roundMoney(previousAmount),
    newAmount,
    newBalance,
    newStatus,
    source: bundle.source,
    feeLineItems: bundle.feeLineItems,
  };
}
