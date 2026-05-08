import { Invoice } from '../entities/Invoice';
import { parseAmount, roundMoney } from './numberUtils';

/**
 * Uniform subtotal: prefer sum of line items when present, else invoices.uniformTotal.
 */
export function getUniformTotalForInvoice(invoice: Invoice | null | undefined): number {
  if (!invoice) return 0;
  const lines = invoice.uniformItems;
  if (Array.isArray(lines) && lines.length > 0) {
    return roundMoney(lines.reduce((sum, row) => sum + parseAmount((row as any).lineTotal), 0));
  }
  return roundMoney(parseAmount(invoice.uniformTotal));
}

function sumFeeLineItems(invoice: Invoice | null | undefined): number {
  if (!invoice) return 0;
  const raw = (invoice as any).feeLineItems;
  if (!Array.isArray(raw) || raw.length === 0) return 0;
  return roundMoney(raw.reduce((sum: number, row: any) => sum + parseAmount(row?.amount), 0));
}

const MONEY_EPS = 0.05;

/**
 * Total charged on this invoice (previous balance + this period's charges).
 * When feeLineItems exist, prefer their sum aligned with `invoice.amount`:
 * - If line sum ≈ `amount`, the lines already represent the full term charge (any separate uniformTotal is stale — do not add uniform again).
 * - Else if line sum + uniform ≈ `amount`, use lines + uniform (canonical split from createInvoice).
 * - Else trust `invoice.amount` to avoid double-counting when metadata disagrees.
 */
export function resolveInvoiceGrossTotal(invoice: Invoice | null | undefined): number {
  if (!invoice) return 0;
  const prev = parseAmount(invoice.previousBalance);
  const amountNum = parseAmount(invoice.amount);
  const uniform = getUniformTotalForInvoice(invoice);
  const fromLines = sumFeeLineItems(invoice);

  if (fromLines > 0.01) {
    const linesPlusUniform = roundMoney(fromLines + uniform);
    if (Math.abs(fromLines - amountNum) < MONEY_EPS) {
      return roundMoney(prev + fromLines);
    }
    if (Math.abs(linesPlusUniform - amountNum) < MONEY_EPS) {
      return roundMoney(prev + linesPlusUniform);
    }
    // Stored amount is missing or zero while fee lines exist (bad row / legacy insert).
    if (amountNum < MONEY_EPS && fromLines > MONEY_EPS) {
      return roundMoney(prev + fromLines);
    }
    return roundMoney(prev + amountNum);
  }

  return roundMoney(prev + amountNum);
}

/**
 * Amount still owed on this invoice. paidAmount includes prepaid applied at issuance and subsequent cash.
 */
export function resolveInvoiceRemainingBalance(invoice: Invoice | null | undefined): number {
  if (!invoice) return 0;
  const gross = resolveInvoiceGrossTotal(invoice);
  const paid = parseAmount(invoice.paidAmount);
  return roundMoney(Math.max(0, gross - paid));
}
