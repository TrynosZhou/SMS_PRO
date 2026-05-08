import { parseAmount, roundMoney } from './numberUtils';
import { resolveTuitionFees, isBoarderStudent, normalizeFeesSettingsObject } from './feesSettingsResolve';

export type RegistrationFeeLine = { description: string; amount: number };

/**
 * Fees charged when a new student is registered: full tuition + desk + registration.
 * Staff children pay none of those; only optional 50% dining hall if they use DH.
 */
export function buildNewStudentRegistrationInvoice(params: {
  feesSettings: Record<string, any> | string | null | undefined;
  studentType: string;
  isStaffChild: boolean;
  usesDiningHall: boolean;
}): { total: number; feeLineItems: RegistrationFeeLine[]; lineDescriptions: string[] } {
  const { feesSettings, studentType, isStaffChild, usesDiningHall } = params;
  const normalized = normalizeFeesSettingsObject(feesSettings) ?? {};
  const { dayScholar, boarder } = resolveTuitionFees(normalized);
  const registrationFee = parseAmount(normalized.registrationFee);
  const deskFee = parseAmount(normalized.deskFee);
  const diningHallCost = parseAmount(normalized.diningHallCost);

  const feeLineItems: RegistrationFeeLine[] = [];
  const lineDescriptions: string[] = [];
  let total = 0;

  if (!isStaffChild) {
    const tuitionFee = isBoarderStudent(studentType) ? boarder : dayScholar;
    if (tuitionFee > 0) {
      const amt = roundMoney(tuitionFee);
      const desc = `Tuition Fee (${studentType})`;
      feeLineItems.push({ description: desc, amount: amt });
      lineDescriptions.push(`${desc}: ${amt}`);
      total += amt;
    }

    if (deskFee > 0) {
      const amt = roundMoney(deskFee);
      feeLineItems.push({ description: 'Desk Fee', amount: amt });
      lineDescriptions.push(`Desk Fee: ${amt}`);
      total += amt;
    }

    if (registrationFee > 0) {
      const amt = roundMoney(registrationFee);
      feeLineItems.push({ description: 'Registration Fee', amount: amt });
      lineDescriptions.push(`Registration Fee: ${amt}`);
      total += amt;
    }
  } else if (usesDiningHall && diningHallCost > 0) {
    const amt = roundMoney(diningHallCost * 0.5);
    feeLineItems.push({ description: 'Dining Hall Fee (Staff Child - 50%)', amount: amt });
    lineDescriptions.push(`Dining Hall Fee (Staff Child - 50%): ${amt}`);
    total += amt;
  }

  total = roundMoney(total);
  return { total, feeLineItems, lineDescriptions };
}
