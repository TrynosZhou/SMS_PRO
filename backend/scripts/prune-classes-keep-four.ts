/**
 * Delete every class except the four named below (exact name match after trim).
 * Clears dependent rows (marks, exams, enrollments, etc.) for removed classes only.
 *
 * Usage (from backend folder):
 *   npx ts-node scripts/prune-classes-keep-four.ts           # dry-run: lists keep / delete
 *   npx ts-node scripts/prune-classes-keep-four.ts --execute # performs deletion
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { In } from 'typeorm';
import { AppDataSource } from '../src/config/database';
import { Class } from '../src/entities/Class';
import { Exam } from '../src/entities/Exam';
import { Marks } from '../src/entities/Marks';
import { ETask } from '../src/entities/ETask';
import { TimetableSlot } from '../src/entities/TimetableSlot';
import { Attendance } from '../src/entities/Attendance';
import { RecordBook } from '../src/entities/RecordBook';
import { ReportCardRemarks } from '../src/entities/ReportCardRemarks';
import { StudentEnrollment } from '../src/entities/StudentEnrollment';
import { PromotionRule } from '../src/entities/PromotionRule';
import { StudentTransfer } from '../src/entities/StudentTransfer';
import { Student } from '../src/entities/Student';
import { TeacherClass } from '../src/entities/TeacherClass';

dotenv.config();

const KEEP_CLASS_NAMES = ['1 Blue', '1 White', 'L6Science', 'Lower6Comm'] as const;

function normalizeName(name: string): string {
  return String(name || '').trim();
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');

  await AppDataSource.initialize();
  console.log('Database connected.\n');

  const classRepo = AppDataSource.getRepository(Class);
  const all = await classRepo.find({ order: { name: 'ASC' } });

  const keepSet = new Set(KEEP_CLASS_NAMES.map((n) => normalizeName(n)));
  const toKeep = all.filter((c) => keepSet.has(normalizeName(c.name)));
  const toDelete = all.filter((c) => !keepSet.has(normalizeName(c.name)));

  console.log('Keeping (by name):');
  for (const name of KEEP_CLASS_NAMES) {
    const found = toKeep.find((c) => normalizeName(c.name) === normalizeName(name));
    if (found) {
      console.log(`  ✓ "${name}" → id ${found.id}`);
    } else {
      console.log(`  ⚠ "${name}" — not found in database (no row to preserve under this name)`);
    }
  }

  console.log('\nClasses to remove:', toDelete.length);
  for (const c of toDelete) {
    console.log(`  - "${c.name}" (${c.id})`);
  }

  if (toDelete.length === 0) {
    console.log('\nNothing to delete.');
    await AppDataSource.destroy();
    return;
  }

  if (!execute) {
    console.log('\nDry-run only. Re-run with --execute to apply changes.');
    await AppDataSource.destroy();
    return;
  }

  const deleteIds = toDelete.map((c) => c.id);
  const mgr = AppDataSource.manager;

  await mgr.transaction(async (em) => {
    const examRepo = em.getRepository(Exam);
    const exams = await examRepo.find({
      where: { classId: In(deleteIds) },
      select: ['id'],
    });
    const examIds = exams.map((e) => e.id);

    if (examIds.length > 0) {
      await em.getRepository(Marks).delete({ examId: In(examIds) });
    }
    await examRepo.delete({ classId: In(deleteIds) });
    await em.getRepository(ETask).delete({ classId: In(deleteIds) });
    await em.getRepository(TimetableSlot).delete({ classId: In(deleteIds) });
    await em.getRepository(Attendance).delete({ classId: In(deleteIds) });
    await em.getRepository(RecordBook).delete({ classId: In(deleteIds) });
    await em.getRepository(ReportCardRemarks).delete({ classId: In(deleteIds) });
    await em.getRepository(StudentEnrollment).delete({ classId: In(deleteIds) });
    await em.getRepository(TeacherClass).delete({ classId: In(deleteIds) });

    await em
      .createQueryBuilder()
      .delete()
      .from(PromotionRule)
      .where('"fromClassId" IN (:...ids)', { ids: deleteIds })
      .execute();
    await em
      .createQueryBuilder()
      .delete()
      .from(PromotionRule)
      .where('"toClassId" IN (:...ids)', { ids: deleteIds })
      .execute();

    await em
      .createQueryBuilder()
      .update(StudentTransfer)
      .set({ previousClassId: null })
      .where('"previousClassId" IN (:...ids)', { ids: deleteIds })
      .execute();
    await em
      .createQueryBuilder()
      .update(StudentTransfer)
      .set({ newClassId: null })
      .where('"newClassId" IN (:...ids)', { ids: deleteIds })
      .execute();

    await em.getRepository(Student).update({ classId: In(deleteIds) }, { classId: null });

    for (const table of ['teachers_classes_classes', 'classes_subjects_subjects'] as const) {
      try {
        await em.query(`DELETE FROM "${table}" WHERE "classesId" = ANY($1::uuid[])`, [deleteIds]);
      } catch (e: any) {
        if (e?.code !== '42P01') {
          throw e;
        }
        console.log(`  (skip join table ${table}: not present)`);
      }
    }

    await em.getRepository(Class).delete({ id: In(deleteIds) });
  });

  console.log(`\nDeleted ${toDelete.length} class(es). Kept: ${toKeep.length}.`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
