import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { User } from '../entities/User';
import { PayrollEmployee } from '../entities/PayrollEmployee';
import { generateTeacherId, getTeacherIdPrefixFromSettings } from './teacherIdGenerator';

/** Auto-generated teacher IDs: {PREFIX} + 7 digits */
const STANDARD_TEACHER_ID = /^([A-Za-z0-9]+)(\d{7})$/;

export interface SyncTeacherIdsResult {
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Ensures every stored teachers.teacherId uses the current teacher ID prefix from Settings.
 * - Standard IDs (PREFIX + 7 digits): swaps PREFIX; resolves collisions with new random 7 digits.
 * - Non-standard IDs: assigns a new generated ID when needed.
 * Updates linked User.username when it matched the old teacherId, and PayrollEmployee.employeeNumber when it matched.
 */
export async function syncStoredTeacherIdsWithSettingsPrefix(): Promise<SyncTeacherIdsResult> {
  const result: SyncTeacherIdsResult = { updated: 0, skipped: 0, errors: [] };

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const prefix = await getTeacherIdPrefixFromSettings();
  const teacherRepo = AppDataSource.getRepository(Teacher);

  const teachers = await teacherRepo.find({ order: { teacherId: 'ASC' } });
  if (teachers.length === 0) {
    return result;
  }

  const occupied = new Set<string>(teachers.map((t) => t.teacherId.trim()));

  const updates: { teacher: Teacher; nextId: string }[] = [];

  for (const t of teachers) {
    const old = t.teacherId.trim();
    // Preserve packaged demo accounts (e.g. DEMO001)
    if (/^DEMO\d+$/i.test(old)) {
      result.skipped++;
      continue;
    }
    // Short legacy codes like T001
    if (/^T\d{3}$/i.test(old)) {
      result.skipped++;
      continue;
    }

    const m = old.match(STANDARD_TEACHER_ID);

    if (m) {
      const oldPref = m[1].toUpperCase();
      const digits = m[2];
      if (oldPref === prefix) {
        result.skipped++;
        continue;
      }
      let candidate = `${prefix}${digits}`;
      if (!occupied.has(candidate)) {
        occupied.delete(old);
        occupied.add(candidate);
        updates.push({ teacher: t, nextId: candidate });
        continue;
      }
      let found: string | null = null;
      for (let attempt = 0; attempt < 500; attempt++) {
        const n = Math.floor(Math.random() * 9000000) + 1000000;
        const cand = `${prefix}${String(n).padStart(7, '0')}`;
        if (!occupied.has(cand)) {
          found = cand;
          break;
        }
      }
      if (!found) {
        result.errors.push(`No free teacher ID for teacher ${t.id} (collision on prefix swap)`);
        continue;
      }
      occupied.delete(old);
      occupied.add(found);
      updates.push({ teacher: t, nextId: found });
      continue;
    }

    // Non-standard format: assign new generated ID
    let next: string | null = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      const gen = await generateTeacherId();
      if (!occupied.has(gen)) {
        next = gen;
        break;
      }
    }
    if (!next) {
      result.errors.push(`Could not generate unique ID for non-standard teacherId "${old}" (${t.id})`);
      continue;
    }
    occupied.delete(old);
    occupied.add(next);
    updates.push({ teacher: t, nextId: next });
  }

  if (updates.length === 0) {
    return result;
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    for (const { teacher, nextId } of updates) {
      const oldId = teacher.teacherId.trim();

      await queryRunner.manager.update(Teacher, { id: teacher.id }, { teacherId: nextId });

      if (teacher.userId) {
        const user = await queryRunner.manager.findOne(User, {
          where: { id: teacher.userId }
        });
        if (user && user.username === oldId) {
          await queryRunner.manager.update(User, { id: user.id }, { username: nextId });
        }
      }

      const payrollRows = await queryRunner.manager.find(PayrollEmployee, {
        where: { employeeNumber: oldId }
      });
      for (const pe of payrollRows) {
        await queryRunner.manager.update(PayrollEmployee, { id: pe.id }, { employeeNumber: nextId });
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
