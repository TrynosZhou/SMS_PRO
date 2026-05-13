import { DataSource } from 'typeorm';
import { FeeCategory } from '../entities/FeeCategory';
import { FeeItem } from '../entities/FeeItem';
import { Class } from '../entities/Class';
import { parseAmount, roundMoney } from './numberUtils';
import {
  feeCategoryAppliesToClass,
  inferStudentFeeLevelBand,
  managedFeeLineMatchesStudentLevel,
  subCategoryMatchesResidence,
} from './managedFeesBilling';
import { isBoarderStudent } from './feesSettingsResolve';

/**
 * Match the fee-item label loosely.  We use word-boundary regex on a label-haystack
 * built from "<itemName> <categoryName>" so a Finance Page item called
 * "Tuition Fee" in the "O Level Fees" category still matches.
 */
const TUITION_RX = /\btuition\b/i;
const DESK_RX = /\bdesk\b/i;
const REGISTRATION_RX = /\bregistration\b|\benrol(?:l|lment)?\b/i;

export interface RegistrationCatalogFees {
  /** Tuition fee for Day Scholars (0 if no matching item in the catalog). */
  dayScholarTuitionFee: number;
  /** Tuition fee for Boarders (0 if no matching item in the catalog). */
  boarderTuitionFee: number;
  /** Desk fee for the student's residence type (0 if none). */
  deskFee: number;
  /** Registration fee for the student's residence type (0 if none). */
  registrationFee: number;
  /** True if any of the four amounts above were resolved from the catalog. */
  hasAny: boolean;
}

/**
 * Read Tuition / Desk Fee / Registration Fee for the student from the
 * Finance → Fees catalog (FeeCategory + FeeItem).
 *
 * Picks the first matching item per category in catalog order, scoped to:
 *  - categories that apply to the student's class / level band, and
 *  - sub-categories that match the student's residence (Day Scholar / Boarder).
 *
 * Multiple matching categories are tolerated (the resolver picks the largest
 * non-zero value for each fee type), which lets schools store O-level and
 * A-level variants and rely on the level-band filter to select one of them.
 */
export async function resolveRegistrationFeesFromCatalog(
  ds: DataSource,
  params: {
    studentType: string;
    classEntity: Class | null | undefined;
  }
): Promise<RegistrationCatalogFees> {
  const catRepo = ds.getRepository(FeeCategory);
  const itemRepo = ds.getRepository(FeeItem);

  const categories = await catRepo.find({
    order: { sortOrder: 'ASC', createdAt: 'ASC' },
  });
  const allItems = await itemRepo.find({
    order: { sortOrder: 'ASC', itemName: 'ASC' },
  });

  let dayScholarTuitionFee = 0;
  let boarderTuitionFee = 0;
  let deskFee = 0;
  let registrationFee = 0;

  if (categories.length === 0 || allItems.length === 0) {
    return { dayScholarTuitionFee, boarderTuitionFee, deskFee, registrationFee, hasAny: false };
  }

  const boarder = isBoarderStudent(params.studentType);
  const levelBand = inferStudentFeeLevelBand(params.classEntity ?? undefined);

  for (const cat of categories) {
    if (!feeCategoryAppliesToClass(cat.name, cat.description, params.classEntity ?? undefined)) {
      continue;
    }

    const catItems = allItems.filter((i) => i.categoryId === cat.id);
    for (const item of catItems) {
      if (!managedFeeLineMatchesStudentLevel(item.itemName, cat.name, cat.description, levelBand)) {
        continue;
      }

      const amount = roundMoney(parseAmount(item.amount));
      if (amount <= 0.001) continue;

      const labelHay = `${item.itemName} ${cat.name}`;

      // Tuition — map catalog subCategory to day-scholar vs boarder columns the same
      // way as computeManagedFeesForStudent. Empty / "All" applies to both; otherwise
      // boarders were only reading boarderTuitionFee from rows whose subCategory text
      // literally contained "board", and generic tuition rows wrongly filled day-scholar only.
      if (TUITION_RX.test(labelHay)) {
        const subRaw = item.subCategory || '';
        if (subCategoryMatchesResidence(subRaw, true)) {
          boarderTuitionFee = Math.max(boarderTuitionFee, amount);
        }
        if (subCategoryMatchesResidence(subRaw, false)) {
          dayScholarTuitionFee = Math.max(dayScholarTuitionFee, amount);
        }
        continue;
      }

      // Desk Fee
      if (DESK_RX.test(labelHay)) {
        if (subCategoryMatchesResidence(item.subCategory, boarder)) {
          deskFee = Math.max(deskFee, amount);
        }
        continue;
      }

      // Registration Fee
      if (REGISTRATION_RX.test(labelHay)) {
        if (subCategoryMatchesResidence(item.subCategory, boarder)) {
          registrationFee = Math.max(registrationFee, amount);
        }
        continue;
      }
    }
  }

  const hasAny =
    dayScholarTuitionFee > 0 ||
    boarderTuitionFee > 0 ||
    deskFee > 0 ||
    registrationFee > 0;

  return { dayScholarTuitionFee, boarderTuitionFee, deskFee, registrationFee, hasAny };
}

/**
 * Merge catalog-resolved Tuition / Desk / Registration into a `feesSettings`-shaped
 * object so it can be handed to `buildNewStudentRegistrationInvoice`.  Any value not
 * present in the catalog falls back to the existing settings entry.
 */
export function buildMergedFeesSettingsForRegistration(
  catalog: RegistrationCatalogFees,
  settingsFees: Record<string, any> | null | undefined
): Record<string, any> {
  const base: Record<string, any> = { ...(settingsFees || {}) };

  if (catalog.dayScholarTuitionFee > 0) {
    base.dayScholarTuitionFee = catalog.dayScholarTuitionFee;
  }
  if (catalog.boarderTuitionFee > 0) {
    base.boarderTuitionFee = catalog.boarderTuitionFee;
  }
  if (catalog.deskFee > 0) {
    base.deskFee = catalog.deskFee;
  }
  if (catalog.registrationFee > 0) {
    base.registrationFee = catalog.registrationFee;
  }

  return base;
}
