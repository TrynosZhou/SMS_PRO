import { DataSource } from 'typeorm';
import { Student } from '../entities/Student';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { parseAmount, roundMoney } from './numberUtils';
import { normalizeFeesSettingsObject } from './feesSettingsResolve';
import {
  computeManagedFeesForStudent,
  buildSettingsFallbackFeeLines,
  applyExemptionForStudent,
} from './managedFeesBilling';
import { getUniformTotalForInvoice } from './invoiceBalanceResolve';

function invoiceIsOpen(inv: Invoice): boolean {
  const s = String(inv.status || '').toLowerCase();
  return s === 'pending' || s === 'partial' || s === 'overdue';
}

/**
 * Re-runs Manage Fees / Settings fee engine (including active Finance exemptions) for each
 * **open** invoice and persists updated term lines, amount, and balance.
 * Use when an exemption was added/changed after invoices were issued, or to repair stale rows.
 */
export async function recalculateOpenFeeInvoicesForStudent(
  ds: DataSource,
  studentId: string
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  const studentRepo = ds.getRepository(Student);
  const invRepo = ds.getRepository(Invoice);

  const student = await studentRepo.findOne({
    where: { id: studentId },
    relations: ['classEntity'],
  });

  if (!student) {
    return { updated: 0, errors: ['Student not found'] };
  }

  const allInvoices = await invRepo.find({
    where: { studentId },
    order: { createdAt: 'ASC' },
  });

  let updated = 0;

  for (const inv of allInvoices) {
    if (!invoiceIsOpen(inv)) {
      continue;
    }

    const hasFeeLines =
      Array.isArray((inv as any).feeLineItems) && (inv as any).feeLineItems.length > 0;
    const hasTerm = Boolean(inv.term && String(inv.term).trim());
    if (!hasFeeLines && !hasTerm) {
      continue;
    }

    const hasPrior = allInvoices.some(
      o =>
        o.id !== inv.id &&
        new Date(o.createdAt).getTime() < new Date(inv.createdAt).getTime()
    );

    try {
      let newTermTotal: number;
      let newLines: Array<{ description: string; amount: number }> | null;

      const managed = await computeManagedFeesForStudent(ds, student as any, {
        hasPreviousInvoice: hasPrior,
      });

      if (managed.hadCatalogLines) {
        newTermTotal = managed.total;
        newLines = managed.lines.length > 0 ? managed.lines : null;
      } else {
        const settings = await ds.getRepository(Settings).findOne({
          where: {},
          order: { createdAt: 'DESC' },
        });
        const fees = normalizeFeesSettingsObject(settings?.feesSettings ?? null);
        if (!fees) {
          errors.push(`${inv.invoiceNumber || inv.id}: no Manage Fees catalog and no Settings fees`);
          continue;
        }
        const rawLines = buildSettingsFallbackFeeLines(student as any, fees, {
          hasPreviousInvoice: hasPrior,
        });
        const rawTotal = roundMoney(rawLines.reduce((s, l) => s + l.amount, 0));
        const applied = await applyExemptionForStudent(ds, student.id, rawLines, rawTotal);
        newTermTotal = applied.total;
        newLines = applied.lines.length > 0 ? applied.lines : null;
      }

      const uniform = getUniformTotalForInvoice(inv);
      const newAmount = roundMoney(newTermTotal + uniform);
      const previousBalance = parseAmount(inv.previousBalance);
      const paidAmount = parseAmount(inv.paidAmount);
      const newGross = roundMoney(previousBalance + newAmount);
      let newBalance = roundMoney(Math.max(0, newGross - paidAmount));

      let newStatus: InvoiceStatus;
      if (newBalance <= 0.001) {
        newStatus = InvoiceStatus.PAID;
        newBalance = 0;
      } else if (paidAmount > 0.001) {
        newStatus = InvoiceStatus.PARTIAL;
      } else {
        newStatus = InvoiceStatus.PENDING;
      }

      if (new Date() > new Date(inv.dueDate) && newBalance > 0.001) {
        newStatus = InvoiceStatus.OVERDUE;
      }

      await invRepo.update(
        { id: inv.id },
        {
          amount: newAmount,
          feeLineItems: newLines as any,
          balance: newBalance,
          status: newStatus,
        }
      );
      updated++;
    } catch (e: any) {
      errors.push(`${inv.invoiceNumber || inv.id}: ${e?.message || String(e)}`);
    }
  }

  return { updated, errors };
}
