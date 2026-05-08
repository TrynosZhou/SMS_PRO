import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { TeacherContractLesson } from '../entities/TeacherContractLesson';

/** Normalize IDs so map keys match even if casing differs between relations and DB. */
export function contractClassSubjectKey(classId: string, subjectId: string): string {
  return `${String(classId).toLowerCase().trim()}:${String(subjectId).toLowerCase().trim()}`;
}

export function contractGenerationKey(teacherId: string, classId: string, subjectId: string): string {
  return `${String(teacherId).toLowerCase().trim()}:${String(classId).toLowerCase().trim()}:${String(subjectId)
    .toLowerCase()
    .trim()}`;
}

/** Request body helper — tolerate string/boolean from JSON proxies or older clients. */
export function parseRequestDoublePeriod(body: any): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const v = body.isDoublePeriod;
  if (v === true || v === 1) {
    return true;
  }
  const s = String(v ?? '').toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') {
    return true;
  }
  const len = String(body.lessonLength ?? '').toLowerCase();
  return len === 'double';
}

/** Sessions per week for one contract line (1–50). */
export function parseRequestSessionsPerWeek(body: any): number {
  if (!body || typeof body !== 'object') {
    return 1;
  }
  const raw = body.sessionsPerWeek ?? body.lessonsPerWeek ?? 1;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.min(50, Math.max(1, Math.round(n)));
}

let contractTableEnsured = false;

/**
 * Creates or migrates `teacher_contract_lessons` (multiple rows per triple; sessionsPerWeek column).
 */
async function ensureTeacherContractLessonsTable(): Promise<void> {
  if (contractTableEnsured) {
    return;
  }
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  try {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "teacher_contract_lessons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "teacherId" uuid NOT NULL,
        "classId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "isDoublePeriod" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_teacher_contract_lessons" PRIMARY KEY ("id"),
        CONSTRAINT "FK_teacher_contract_lessons_teacher" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_contract_lessons_class" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teacher_contract_lessons_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE
      )
    `);
    await qr.query(
      `ALTER TABLE "teacher_contract_lessons" ADD COLUMN IF NOT EXISTS "sessionsPerWeek" integer NOT NULL DEFAULT 1`
    );
    await qr.query(
      `UPDATE "teacher_contract_lessons" SET "sessionsPerWeek" = 1 WHERE "sessionsPerWeek" IS NULL`
    );
    await qr.query(
      `ALTER TABLE "teacher_contract_lessons" ALTER COLUMN "sessionsPerWeek" SET DEFAULT 1`
    );
    await qr.query(
      `ALTER TABLE "teacher_contract_lessons" ADD COLUMN IF NOT EXISTS "classScope" varchar(20) NOT NULL DEFAULT 'entire'`
    );
    // Drop legacy unique triple so multiple lesson lines per class+subject are allowed
    await qr.query(
      `ALTER TABLE "teacher_contract_lessons" DROP CONSTRAINT IF EXISTS "UQ_teacher_contract_lessons_triple"`
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_teacher_contract_lessons_teacherId" ON "teacher_contract_lessons" ("teacherId")`
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_teacher_contract_lessons_classId" ON "teacher_contract_lessons" ("classId")`
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "IDX_teacher_contract_lessons_tcp_triple" ON "teacher_contract_lessons" ("teacherId", "classId", "subjectId")`
    );
    contractTableEnsured = true;
  } catch (e: any) {
    console.error('[TeacherContractLesson] ensureTeacherContractLessonsTable:', e?.message || e);
    throw e;
  } finally {
    await qr.release();
  }
}

const VALID_SCOPES = new Set(['entire', 'group1', 'group2', 'boys', 'girls']);

function normaliseScope(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  return VALID_SCOPES.has(s) ? s : 'entire';
}

export async function insertTeacherContractLesson(
  teacherId: string,
  classId: string,
  subjectId: string,
  isDoublePeriod: boolean,
  sessionsPerWeek: number,
  classScope?: string
): Promise<TeacherContractLesson> {
  await ensureTeacherContractLessonsTable();
  const repo = AppDataSource.getRepository(TeacherContractLesson);
  const spw = Math.min(50, Math.max(1, Math.round(sessionsPerWeek)));
  const row = repo.create({
    teacherId,
    classId,
    subjectId,
    isDoublePeriod,
    sessionsPerWeek: spw,
    classScope: normaliseScope(classScope),
  });
  return repo.save(row);
}

export async function updateTeacherContractLesson(
  id: string,
  teacherId: string,
  patch: { isDoublePeriod?: boolean; sessionsPerWeek?: number; classScope?: string }
): Promise<TeacherContractLesson | null> {
  await ensureTeacherContractLessonsTable();
  const repo = AppDataSource.getRepository(TeacherContractLesson);
  const row = await repo.findOne({ where: { id, teacherId } });
  if (!row) {
    return null;
  }
  if (patch.isDoublePeriod !== undefined) {
    row.isDoublePeriod = patch.isDoublePeriod;
  }
  if (patch.sessionsPerWeek !== undefined) {
    row.sessionsPerWeek = Math.min(50, Math.max(1, Math.round(patch.sessionsPerWeek)));
  }
  if (patch.classScope !== undefined) {
    row.classScope = normaliseScope(patch.classScope);
  }
  return repo.save(row);
}

/** @deprecated Prefer insert/update; kept for scripts */
export async function upsertTeacherContractLesson(
  teacherId: string,
  classId: string,
  subjectId: string,
  isDoublePeriod: boolean
): Promise<void> {
  await ensureTeacherContractLessonsTable();
  const repo = AppDataSource.getRepository(TeacherContractLesson);
  const existing = await repo.find({ where: { teacherId, classId, subjectId } });
  if (existing.length === 0) {
    await insertTeacherContractLesson(teacherId, classId, subjectId, isDoublePeriod, 1);
    return;
  }
  if (existing.length === 1) {
    existing[0].isDoublePeriod = isDoublePeriod;
    await repo.save(existing[0]);
    return;
  }
  const first = existing[0];
  first.isDoublePeriod = isDoublePeriod;
  await repo.save(first);
}

export async function deleteTeacherContractLesson(
  teacherId: string,
  classId: string,
  subjectId: string
): Promise<void> {
  try {
    await ensureTeacherContractLessonsTable();
    const repo = AppDataSource.getRepository(TeacherContractLesson);
    await repo.delete({ teacherId, classId, subjectId });
  } catch (e: any) {
    console.warn('[TeacherContractLesson] delete:', e?.message || e);
  }
}

export async function deleteTeacherContractLessonById(
  teacherId: string,
  contractLessonId: string
): Promise<boolean> {
  await ensureTeacherContractLessonsTable();
  const repo = AppDataSource.getRepository(TeacherContractLesson);
  const r = await repo.delete({ id: contractLessonId, teacherId });
  return (r.affected ?? 0) > 0;
}

function rowIsDouble(r: TeacherContractLesson): boolean {
  const v = r.isDoublePeriod as boolean | null | undefined;
  return v === true;
}

/** All contract lines for one teacher (contact grid + timetable). */
export async function loadContractLessonsForTeacher(teacherId: string): Promise<TeacherContractLesson[]> {
  try {
    await ensureTeacherContractLessonsTable();
    const repo = AppDataSource.getRepository(TeacherContractLesson);
    return repo.find({
      where: { teacherId },
      order: { classId: 'ASC', subjectId: 'ASC', id: 'ASC' },
    });
  } catch (e: any) {
    console.warn('[TeacherContractLesson] loadContractLessonsForTeacher:', e?.message || e);
    return [];
  }
}

/** All contract lines for one class (assign-teachers / lessons-for-class UI). */
export async function loadContractLessonsForClass(classId: string): Promise<TeacherContractLesson[]> {
  try {
    await ensureTeacherContractLessonsTable();
    const repo = AppDataSource.getRepository(TeacherContractLesson);
    return repo.find({
      where: { classId: String(classId) },
      order: { subjectId: 'ASC', teacherId: 'ASC', id: 'ASC' },
    });
  } catch (e: any) {
    console.warn('[TeacherContractLesson] loadContractLessonsForClass:', e?.message || e);
    return [];
  }
}

/** Map key classId:subjectId → double flag (true if any line for that pair is double — legacy helper; prefer raw lines). */
export async function loadDoubleMapForTeacherClassesSubjects(
  teacherId: string
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const lines = await loadContractLessonsForTeacher(teacherId);
  for (const r of lines) {
    const k = contractClassSubjectKey(r.classId, r.subjectId);
    if (rowIsDouble(r)) {
      map.set(k, true);
    } else if (!map.has(k)) {
      map.set(k, false);
    }
  }
  return map;
}

/** Map key teacherId:classId:subjectId → isDouble (first line only — generation uses loadContractLessonsForGeneration). */
export async function loadDoubleMapForGeneration(teacherIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (!teacherIds.length) {
    return map;
  }
  try {
    await ensureTeacherContractLessonsTable();
    const repo = AppDataSource.getRepository(TeacherContractLesson);
    const rows = await repo.find({ where: { teacherId: In(teacherIds) } });
    for (const r of rows) {
      const k = contractGenerationKey(r.teacherId, r.classId, r.subjectId);
      if (rowIsDouble(r)) {
        map.set(k, true);
      } else if (!map.has(k)) {
        map.set(k, false);
      }
    }
  } catch (e: any) {
    console.warn('[TeacherContractLesson] loadDoubleMapForGeneration:', e?.message || e);
  }
  return map;
}

/** All contract lines for timetable generation for given teachers. */
export async function loadContractLessonsForGeneration(teacherIds: string[]): Promise<TeacherContractLesson[]> {
  if (!teacherIds.length) {
    return [];
  }
  try {
    await ensureTeacherContractLessonsTable();
    const repo = AppDataSource.getRepository(TeacherContractLesson);
    return repo.find({
      where: { teacherId: In(teacherIds) },
      order: { teacherId: 'ASC', classId: 'ASC', subjectId: 'ASC', id: 'ASC' },
    });
  } catch (e: any) {
    console.warn('[TeacherContractLesson] loadContractLessonsForGeneration:', e?.message || e);
    return [];
  }
}
