import { DataSource } from 'typeorm';
import { FeeCategory } from '../entities/FeeCategory';
import { FeeItem } from '../entities/FeeItem';
import { Student } from '../entities/Student';
import { Class } from '../entities/Class';
import { StudentFeeExemption } from '../entities/StudentFeeExemption';
import { parseAmount, roundMoney } from './numberUtils';
import { isBoarderStudent, resolveTuitionFees } from './feesSettingsResolve';
import {
  applyActiveFeeExemptionToManagedLines,
  type FeeLine,
} from './applyFeeExemption';
import {
  shouldIncludeFeeForTermPeriod,
  type TermPeriodType,
} from './termPeriodType';
import { formatTuitionLineDescription } from './tuitionLineDescription';

const TUITION_RX = /\btuition\b/i;

export type ManagedFeeLine = FeeLine;

/** Student academic band for fee catalog rows split into O vs A Level. */
export type StudentFeeLevelBand = 'O_LEVEL' | 'A_LEVEL' | 'UNKNOWN';

const ONE_TIME_RX = /\b(desk|registration|enrol|enroll)\b/i;
const TRANSPORT_RX = /\btransport|bus\b/i;
const DINING_RX = /\bdining|\bdh\b|cafeteria|meal|lunch\b/i;

/** O-level-only catalog text (category/item names like "O Level Fees"). */
const O_LEVEL_FEE_RX =
  /\bo[-\s]*level\b|\bordinary\s*level\b|\bordinary\b(?!\s*and\s*a)|\bo\s*['']?level\s*fees?\b/i;
/** A-level-only catalog text. */
const A_LEVEL_FEE_RX =
  /\ba[-\s]*level\b|\badvanced\s*level\b|\blower\s*6\b|\bupper\s*6\b|\bsixth\s*form\b|\ba\s*['']?level\s*fees?\b/i;

/**
 * Infer O vs A level from class name/form (e.g. Form 1–4 → O, Form 5–6 → A).
 */
export function inferStudentFeeLevelBand(classEntity: Class | null | undefined): StudentFeeLevelBand {
  // No class yet (e.g. registered before enrolment): assume O-level band so Finance
  // catalog rows tagged "O Level" still resolve. UNKNOWN would exclude those rows
  // and force a fallback to Settings fees (often stale placeholders).
  if (!classEntity) return 'O_LEVEL';
  const raw = `${classEntity.form || ''} ${classEntity.name || ''}`.trim();
  if (!raw) return 'UNKNOWN';
  const low = raw.toLowerCase();

  if (/\b(lower|upper)\s*6\b|\bform\s*[5-6]\b|\bl6\b|\bu6\b|\bsixth\s*form\b/i.test(low)) {
    return 'A_LEVEL';
  }
  if (/\bform\s*[1-4]\b/i.test(low)) {
    return 'O_LEVEL';
  }

  const formNum = low.match(/\bform\s*(\d+)\b/i)?.[1];
  if (formNum) {
    const n = parseInt(formNum, 10);
    if (n >= 5) return 'A_LEVEL';
    if (n >= 1 && n <= 4) return 'O_LEVEL';
  }

  return 'UNKNOWN';
}

export function isALevelSubjectCategory(category: string | null | undefined): boolean {
  const c = String(category || 'O_LEVEL').toUpperCase().replace(/[\s-]+/g, '_');
  return c === 'A_LEVEL' || c === 'AS_A_LEVEL';
}

/** Whether an active subject applies to the class O vs A level band. */
export function subjectMatchesClassLevelBand(
  subjectCategory: string | null | undefined,
  band: StudentFeeLevelBand
): boolean {
  const isA = isALevelSubjectCategory(subjectCategory);
  if (band === 'A_LEVEL') return isA;
  if (band === 'O_LEVEL') return !isA;
  return !isA;
}

export function filterSubjectsForClass<T extends { category?: string | null }>(
  subjects: T[],
  classEntity: Class | null | undefined
): T[] {
  const band = inferStudentFeeLevelBand(classEntity);
  return subjects.filter((s) => subjectMatchesClassLevelBand(s.category, band));
}

/**
 * When fee catalog uses separate O vs A Level categories, skip rows that do not match the student's class.
 */
export function managedFeeLineMatchesStudentLevel(
  itemName: string,
  categoryName: string,
  categoryDesc: string,
  band: StudentFeeLevelBand
): boolean {
  const hay = `${itemName} ${categoryName} ${categoryDesc || ''}`;
  const oHint = O_LEVEL_FEE_RX.test(hay);
  const aHint = A_LEVEL_FEE_RX.test(hay);

  if (oHint && aHint) return true;
  if (oHint && !aHint) {
    if (band === 'A_LEVEL') return false;
    if (band === 'UNKNOWN') return false;
    return true;
  }
  if (aHint && !oHint) {
    if (band === 'O_LEVEL') return false;
    if (band === 'UNKNOWN') return false;
    return true;
  }
  return true;
}

/**
 * If the student's class matches explicit Form N in the category text, require same form;
 * categories without a Form N hint apply to all classes.
 */
export function feeCategoryAppliesToClass(
  categoryName: string,
  categoryDesc: string,
  classEntity: Class | null | undefined
): boolean {
  if (!classEntity?.name && !classEntity?.form) return true;

  const hay = `${categoryName} ${categoryDesc || ''}`.toLowerCase();
  const cn = (classEntity.name || '').trim().toLowerCase();
  const cf = (classEntity.form || '').trim().toLowerCase();

  if (cn && hay.includes(cn)) return true;
  if (cf && hay.includes(cf)) return true;

  const catFormNums = [...hay.matchAll(/\bform\s*(\d+)\b/g)].map(m => m[1]);
  if (catFormNums.length > 0) {
    const studentFormNum = cf.match(/\bform\s*(\d+)\b/i)?.[1];
    if (!studentFormNum) return false;
    return catFormNums.includes(studentFormNum);
  }

  return true;
}

/** Sub-category on the fees page (e.g. Day Scholars / Boarders) vs student residence. */
export function subCategoryMatchesResidence(subCategory: string, boarder: boolean): boolean {
  const s = subCategory.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s || s === 'all' || s.includes('all student')) return true;
  if (boarder) {
    return s.includes('board');
  }
  if (s.includes('day') && s.includes('scholar')) return true;
  return s === 'dayscholar' || s.includes('day-scholar');
}

/**
 * Load active Finance exemption and apply {@link applyActiveFeeExemptionToManagedLines}.
 */
export async function applyExemptionForStudent(
  ds: DataSource,
  studentId: string,
  lines: ManagedFeeLine[],
  total: number
): Promise<{ lines: ManagedFeeLine[]; total: number }> {
  const exRepo = ds.getRepository(StudentFeeExemption);
  const activeEx = await exRepo.findOne({
    where: { studentId, isActive: true },
  });
  return applyActiveFeeExemptionToManagedLines(lines, total, activeEx ?? undefined);
}

/**
 * Line items mirroring Settings → Fees when Manage Fees catalog is empty (legacy path).
 */
export function buildSettingsFallbackFeeLines(
  student: Student & { classEntity?: Class | null },
  fees: Record<string, any>,
  options: {
    hasPreviousInvoice: boolean;
    termPeriodType?: TermPeriodType;
    termLabel?: string;
  }
): ManagedFeeLine[] {
  const lines: ManagedFeeLine[] = [];
  const shouldChargeDeskFee = !options.hasPreviousInvoice;

  const { dayScholar: dayScholarTuitionFee, boarder: boarderTuitionFee } = resolveTuitionFees(fees);
  const deskFee = parseAmount(fees.deskFee);
  const transportCost = parseAmount(fees.transportCost);
  const diningHallCost = parseAmount(fees.diningHallCost);
  const libraryFee = parseAmount(fees.libraryFee);
  const sportsFee = parseAmount(fees.sportsFee);
  const otherFees = Array.isArray(fees.otherFees) ? fees.otherFees : [];

  if (!student.isStaffChild) {
    const tuitionFee = isBoarderStudent(student.studentType)
      ? boarderTuitionFee
      : dayScholarTuitionFee;
    if (tuitionFee > 0.001) {
      const band = inferStudentFeeLevelBand(student.classEntity ?? undefined);
      lines.push({
        description: formatTuitionLineDescription(band, options.termLabel || ''),
        amount: roundMoney(tuitionFee),
      });
    }
  }

  if (!student.isStaffChild && shouldChargeDeskFee && deskFee > 0.001) {
    lines.push({ description: 'Desk fee', amount: roundMoney(deskFee) });
  }

  if (!student.isStaffChild) {
    if (libraryFee > 0.001) {
      lines.push({ description: 'Library fee', amount: roundMoney(libraryFee) });
    }
    if (sportsFee > 0.001) {
      lines.push({ description: 'Sports fee', amount: roundMoney(sportsFee) });
    }
    for (const fee of otherFees) {
      const amt = parseAmount((fee as any)?.amount);
      if (amt > 0.001) {
        const name =
          String((fee as any)?.name || (fee as any)?.label || 'Fee').trim() || 'Fee';
        if (!shouldIncludeFeeForTermPeriod(name, options.termPeriodType)) continue;
        lines.push({ description: `${name} (Other fee)`, amount: roundMoney(amt) });
      }
    }
  }

  if (
    !isBoarderStudent(student.studentType) &&
    student.usesTransport &&
    !student.isStaffChild &&
    transportCost > 0.001
  ) {
    lines.push({ description: 'Transport fee', amount: roundMoney(transportCost) });
  }

  if (student.usesDiningHall && diningHallCost > 0.001) {
    const amt = student.isStaffChild
      ? roundMoney(diningHallCost * 0.5)
      : roundMoney(diningHallCost);
    lines.push({
      description: student.isStaffChild
        ? 'Dining hall fee (Staff child 50%)'
        : 'Dining hall fee',
      amount: amt,
    });
  }

  return lines;
}

/**
 * Build term billing lines from Finance → Manage → Fees (fee_categories / fee_items).
 */
export async function computeManagedFeesForStudent(
  ds: DataSource,
  student: Student & { classEntity?: Class | null },
  options: {
    hasPreviousInvoice: boolean;
    termPeriodType?: TermPeriodType;
    termLabel?: string;
  }
): Promise<{ lines: ManagedFeeLine[]; total: number; hadCatalogLines: boolean }> {
  const catRepo = ds.getRepository(FeeCategory);
  const itemRepo = ds.getRepository(FeeItem);
  const categories = await catRepo.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  const allItems = await itemRepo.find({ order: { sortOrder: 'ASC', itemName: 'ASC' } });

  if (categories.length === 0 || allItems.length === 0) {
    return { lines: [], total: 0, hadCatalogLines: false };
  }

  const boarder = isBoarderStudent(student.studentType);
  const classEntity = student.classEntity ?? undefined;
  const levelBand = inferStudentFeeLevelBand(classEntity);
  const lines: ManagedFeeLine[] = [];

  for (const cat of categories) {
    if (!feeCategoryAppliesToClass(cat.name, cat.description, classEntity)) continue;

    const catItems = allItems.filter(i => i.categoryId === cat.id);
    for (const item of catItems) {
      if (!subCategoryMatchesResidence(item.subCategory, boarder)) continue;

      if (
        !managedFeeLineMatchesStudentLevel(item.itemName, cat.name, cat.description, levelBand)
      ) {
        continue;
      }

      let amount = parseAmount(item.amount);
      if (amount <= 0.001) continue;

      const labelBits = `${item.itemName} ${cat.name}`;

      if (!shouldIncludeFeeForTermPeriod(labelBits, options.termPeriodType)) continue;

      if (student.isStaffChild) {
        if (DINING_RX.test(labelBits) && student.usesDiningHall) {
          amount = roundMoney(amount * 0.5);
        } else {
          continue;
        }
      } else {
        if (DINING_RX.test(labelBits) && !student.usesDiningHall) continue;
      }

      if (options.hasPreviousInvoice && ONE_TIME_RX.test(labelBits)) continue;

      if (TRANSPORT_RX.test(labelBits)) {
        if (boarder || !student.usesTransport) continue;
      }

      const description =
        TUITION_RX.test(labelBits) && (options.termLabel || '').trim()
          ? formatTuitionLineDescription(levelBand, options.termLabel || '')
          : `${item.itemName} (${cat.name})`;

      lines.push({
        description,
        amount: roundMoney(amount),
      });
    }
  }

  const hadCatalogLines = lines.length > 0;
  const totalBefore = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
  const applied = await applyExemptionForStudent(ds, student.id, lines, totalBefore);
  return { lines: applied.lines, total: applied.total, hadCatalogLines };
}
