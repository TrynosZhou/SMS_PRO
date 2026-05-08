import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { User } from '../entities/User';
import { generateStudentId, getStudentIdPrefixFromSettings } from './studentIdGenerator';

/** Auto-generated student IDs: AAA###YYYY */
const STANDARD_STUDENT_NUMBER = /^([A-Za-z]{3})(\d{3})(\d{4})$/;

function lettersPrefixOf(value: string): string {
  return value.replace(/[^A-Za-z]/g, '').toUpperCase();
}

export interface SyncStudentNumbersResult {
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Ensures every stored studentNumber uses the current student ID prefix from Settings.
 * - Standard IDs (AAA###YYYY): swaps AAA to the settings prefix; resolves collisions with a new ### for the same year.
 * - Non-standard IDs: if they already "start with" the prefix (letters only), leaves them; otherwise assigns a new generated ID.
 * Updates linked student User.username when it matched the old student number.
 */
export async function syncStoredStudentNumbersWithSettingsPrefix(): Promise<SyncStudentNumbersResult> {
  const result: SyncStudentNumbersResult = { updated: 0, skipped: 0, errors: [] };

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const prefix = await getStudentIdPrefixFromSettings();
  const studentRepo = AppDataSource.getRepository(Student);

  const students = await studentRepo.find({ order: { studentNumber: 'ASC' } });
  if (students.length === 0) {
    return result;
  }

  /** Tracks numbers in use after planned renames */
  const occupied = new Set<string>(students.map((s) => s.studentNumber.trim()));

  const updates: { student: Student; nextNumber: string }[] = [];

  for (const s of students) {
    const old = s.studentNumber.trim();
    // Preserve packaged demo accounts (e.g. DEMO001) used for shared demo login
    if (/^DEMO\d+$/i.test(old)) {
      result.skipped++;
      continue;
    }
    const m = old.match(STANDARD_STUDENT_NUMBER);

    if (m) {
      const oldPref = m[1].toUpperCase();
      const mid = m[2];
      const year = m[3];
      if (oldPref === prefix) {
        result.skipped++;
        continue;
      }
      let candidate = `${prefix}${mid}${year}`;
      if (!occupied.has(candidate)) {
        occupied.delete(old);
        occupied.add(candidate);
        updates.push({ student: s, nextNumber: candidate });
        continue;
      }
      // Collision: pick another ### for same year
      let found: string | null = null;
      for (let attempt = 0; attempt < 2000; attempt++) {
        const n = Math.floor(Math.random() * 1000);
        const cand = `${prefix}${String(n).padStart(3, '0')}${year}`;
        if (!occupied.has(cand)) {
          found = cand;
          break;
        }
      }
      if (!found) {
        result.errors.push(`No free student number for year ${year} (student ${s.id})`);
        continue;
      }
      occupied.delete(old);
      occupied.add(found);
      updates.push({ student: s, nextNumber: found });
      continue;
    }

    // Non-standard format
    const letters = lettersPrefixOf(old);
    if (letters.startsWith(prefix)) {
      result.skipped++;
      continue;
    }

    let next: string | null = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      const gen = await generateStudentId();
      if (!occupied.has(gen)) {
        next = gen;
        break;
      }
    }
    if (!next) {
      result.errors.push(`Could not generate unique ID for non-standard studentNumber "${old}" (${s.id})`);
      continue;
    }
    occupied.delete(old);
    occupied.add(next);
    updates.push({ student: s, nextNumber: next });
  }

  if (updates.length === 0) {
    return result;
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    for (const { student, nextNumber } of updates) {
      const oldNumber = student.studentNumber.trim();

      await queryRunner.manager.update(Student, { id: student.id }, { studentNumber: nextNumber });

      if (student.userId) {
        const user = await queryRunner.manager.findOne(User, {
          where: { id: student.userId }
        });
        if (user && user.username === oldNumber) {
          await queryRunner.manager.update(User, { id: user.id }, { username: nextNumber });
        }
      }

      result.updated++;
    }

    await queryRunner.commitTransaction();
  } catch (e: any) {
    await queryRunner.rollbackTransaction();
    result.errors.push(e?.message || String(e));
    result.updated = 0;
  } finally {
    await queryRunner.release();
  }

  return result;
}
