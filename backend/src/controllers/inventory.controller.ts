import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { InventorySettings } from '../entities/InventorySettings';
import { TextbookCatalog } from '../entities/TextbookCatalog';
import { TextbookCopy } from '../entities/TextbookCopy';
import { FurnitureItem } from '../entities/FurnitureItem';
import { TextbookPermanentIssue } from '../entities/TextbookPermanentIssue';
import { LibraryLoan } from '../entities/LibraryLoan';
import { FurnitureAssignment } from '../entities/FurnitureAssignment';
import { InventoryFine } from '../entities/InventoryFine';
import { InventoryAuditLog } from '../entities/InventoryAuditLog';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { User } from '../entities/User';
import { TextbookTransfer, TextbookHolderType } from '../entities/TextbookTransfer';
import { Brackets, EntityManager, In, IsNull, Not } from 'typeorm';
import { parsePaginationParams } from '../utils/pagination';

const COPY_IN_STOCK = 'in_stock';
const COPY_PERM = 'permanent_out';
const COPY_LOAN = 'on_loan';
const COPY_LOST = 'lost';
const COPY_WITH_HOD = 'with_hod';
const COPY_WITH_TEACHER = 'with_teacher';
const COPY_WITH_STUDENT = 'with_student';

/** Student already holds a copy of this catalog while in one of these statuses (one title per student). */
const STUDENT_HOLDS_COPY_STATUSES = [COPY_WITH_STUDENT, COPY_PERM, COPY_LOAN];

const FURN_IN_STOCK = 'in_stock';
const FURN_ASSIGNED = 'assigned';
const FURN_WITH_TEACHER = 'with_teacher';
const FURN_LOST = 'lost';

const FINE_PENDING = 'pending';
const FINE_PAID = 'paid';
const FINE_WAIVED = 'waived';
const FINE_OVERDUE = 'overdue_book';
const FINE_DAMAGE = 'damage_furniture';
const FINE_LOST = 'lost_item';

const INV_MANAGE_ROLES = new Set<string>([
  UserRole.LIBRARIAN,
  UserRole.INVENTORY_CLERK,
  UserRole.HOD,
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
]);

const INV_REPORT_ROLES = INV_MANAGE_ROLES;

function roleStr(u: AuthRequest['user']): string {
  return String(u?.role || '').toLowerCase();
}

async function getActorTeacherByUserId(userId: string): Promise<Teacher | null> {
  return await AppDataSource.getRepository(Teacher).findOne({
    where: { userId } as any,
    relations: ['classes', 'department'],
  });
}

async function studentIdsInActiveClass(em: EntityManager, classId: string): Promise<string[]> {
  const idSet = new Set<string>();
  const direct = await em.getRepository(Student).find({
    where: { classId, isActive: true } as any,
    select: ['id'],
  });
  for (const s of direct) idSet.add(s.id);
  const enrolled = await em
    .getRepository(Student)
    .createQueryBuilder('st')
    .select('st.id')
    .innerJoin('st.enrollments', 'e')
    .where('e.classId = :cid', { cid: classId })
    .andWhere('e.isActive = :ea', { ea: true })
    .andWhere('st.isActive = :act', { act: true })
    .getMany();
  for (const s of enrolled) idSet.add(s.id);
  return [...idSet];
}

function assertSingleCatalogPerTeacherIssueBatch(copies: TextbookCopy[]): void {
  const seen = new Set<string>();
  for (const c of copies) {
    const cat = String(c.catalogId || '').trim();
    if (!cat) continue;
    if (seen.has(cat)) {
      throw Object.assign(
        new Error('You cannot issue two copies of the same textbook title to the same student in one step.'),
        { status: 400 }
      );
    }
    seen.add(cat);
  }
}

async function assertStudentDoesNotHoldCatalogTitle(
  em: EntityManager,
  studentId: string,
  catalogId: string
): Promise<void> {
  const row = await em
    .getRepository(TextbookCopy)
    .createQueryBuilder('c')
    .leftJoinAndSelect('c.catalog', 'cat')
    .where('c.currentStudentId = :sid', { sid: studentId })
    .andWhere('c.catalogId = :cid', { cid: catalogId })
    .andWhere('c.status IN (:...sts)', { sts: STUDENT_HOLDS_COPY_STATUSES })
    .getOne();
  if (row) {
    const title = (row as any).catalog?.title || 'this title';
    throw Object.assign(
      new Error(`This student already has a copy of "${title}". Only one textbook per title is allowed per student.`),
      { status: 400 }
    );
  }
}

async function resolveFurnitureByRef(em: EntityManager, ref: string): Promise<FurnitureItem | null> {
  const s = String(ref || '').trim();
  if (!s) return null;
  // Avoid Postgres UUID cast errors when refs are human codes (e.g. DK0001 / CH0001).
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  if (looksLikeUuid) {
    const byId = await em.getRepository(FurnitureItem).findOne({ where: { id: s } as any });
    if (byId) return byId;
  }
  return em.getRepository(FurnitureItem).findOne({ where: { itemCode: s } as any });
}

function parseFurnitureRefList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x: any) => String(x || '').trim()).filter(Boolean))];
  }
  return [
    ...new Set(
      String(raw || '')
        .split(/[\s,]+/)
        .map(x => x.trim())
        .filter(Boolean)
    ),
  ];
}

async function assertIsClassTeacherOfAtLeastOneClass(em: EntityManager, teacherId: string): Promise<void> {
  const n = await em.getRepository(Class).count({ where: { classTeacherId: teacherId } as any });
  if (n < 1) {
    throw Object.assign(new Error('Target teacher is not assigned as class teacher for any class'), { status: 400 });
  }
}

function canIssueOrRevokeFurnitureAsStaff(user: AuthRequest['user']): boolean {
  return canManageInventory(user) || roleStr(user) === UserRole.TEACHER;
}

function isTeacherEntityHod(teacher: Teacher | null | undefined): boolean {
  return String(teacher?.role || '').toLowerCase() === 'hod';
}

/** User account role is teacher or HOD (both map to a Teacher profile for "me" inventory APIs). */
function isTeacherOrHodActor(user: AuthRequest['user']): boolean {
  const r = roleStr(user);
  return r === UserRole.TEACHER || r === UserRole.HOD;
}

export function canManageInventory(user: AuthRequest['user']): boolean {
  return INV_MANAGE_ROLES.has(roleStr(user) as UserRole);
}

export function canRunInventoryReports(user: AuthRequest['user']): boolean {
  return INV_REPORT_ROLES.has(roleStr(user) as UserRole);
}

function isElevatedAdmin(user: AuthRequest['user']): boolean {
  const r = roleStr(user);
  return r === UserRole.ADMIN || r === UserRole.SUPERADMIN;
}

function authStudentId(req: AuthRequest): string | undefined {
  if (req.authStudentRecordId) return req.authStudentRecordId;
  const s = req.user?.student as { id?: string } | undefined;
  return s?.id && typeof s.id === 'string' ? s.id : undefined;
}

function assertCanViewStudent(req: AuthRequest, studentId: string): void {
  if (canManageInventory(req.user)) return;
  if (roleStr(req.user) === UserRole.STUDENT) {
    const sid = authStudentId(req);
    if (sid === studentId) return;
  }
  throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

function parseOptionalDate(v: unknown): Date | undefined {
  if (v == null || v === '') return undefined;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
}

function reportDateClause(column: string, from?: Date, to?: Date): { sql: string; params: Record<string, unknown> } {
  if (!from && !to) return { sql: '1=1', params: {} };
  const params: Record<string, unknown> = {};
  if (from && to) {
    params.from = from;
    params.to = to;
    return { sql: `${column} BETWEEN :from AND :to`, params };
  }
  if (from) {
    params.from = from;
    return { sql: `${column} >= :from`, params };
  }
  params.to = to!;
  return { sql: `${column} <= :to`, params };
}

function normalizeCondition(c: unknown): 'good' | 'torn' | 'lost' | null {
  const x = String(c || '')
    .trim()
    .toLowerCase();
  if (x === 'good' || x === 'torn' || x === 'lost') return x;
  return null;
}

async function getOrCreateSettings(em: EntityManager): Promise<InventorySettings> {
  const repo = em.getRepository(InventorySettings);
  let row = await repo.findOne({ where: {} as any });
  if (!row) {
    row = repo.create({
      libraryLoanDaysDefault: 14,
      overdueFinePerDay: '1.00',
      autoLossDaysAfterDue: 30,
    });
    await repo.save(row);
  }
  return row;
}

async function audit(
  em: EntityManager,
  p: {
    action: string;
    entityType: string;
    entityId: string;
    studentId?: string | null;
    performedByUserId?: string | null;
    payload?: Record<string, unknown> | null;
  }
): Promise<void> {
  const log = em.getRepository(InventoryAuditLog).create({
    action: p.action,
    entityType: p.entityType,
    entityId: p.entityId,
    studentId: p.studentId ?? null,
    performedByUserId: p.performedByUserId ?? null,
    payload: p.payload ?? null,
  });
  await em.getRepository(InventoryAuditLog).save(log);
}

async function nextSequentialCode(
  em: EntityManager,
  entity: typeof TextbookCopy | typeof FurnitureItem,
  field: 'assetTag' | 'itemCode',
  prefix: string,
  width: number
): Promise<string> {
  const repo = em.getRepository(entity);
  const rows = await repo
    .createQueryBuilder('e')
    .select(`e.${field}`, 'code')
    .where(`e.${field} LIKE :pfx`, { pfx: `${prefix}%` })
    .getRawMany();
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`, 'i');
  for (const r of rows) {
    const m = String(r.code || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

async function resolveCopyIdsFromInputs(
  em: EntityManager,
  body: Record<string, unknown>
): Promise<{ ids: string[] }> {
  const copyIds = Array.isArray(body.copyIds)
    ? [...new Set((body.copyIds as unknown[]).map(x => String(x).trim()).filter(Boolean))]
    : [];
  const singleBn = body.bookNumber != null ? String(body.bookNumber).trim() : '';
  let bookNumbers: string[] = [];
  if (Array.isArray(body.bookNumbers)) {
    bookNumbers = [...new Set((body.bookNumbers as unknown[]).map(x => String(x).trim()).filter(Boolean))];
  } else if (typeof body.bookNumbers === 'string' && body.bookNumbers.trim()) {
    bookNumbers = String(body.bookNumbers)
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (!bookNumbers.length && singleBn) bookNumbers = [singleBn];
  const ids = new Set<string>(copyIds);
  if (bookNumbers.length) {
    const copies = await em.getRepository(TextbookCopy).find({ where: { assetTag: In(bookNumbers) } as any });
    for (const c of copies) ids.add(c.id);
  }
  return { ids: [...ids] };
}

async function logTextbookTransfer(
  em: EntityManager,
  args: {
    copyId: string;
    fromType: TextbookHolderType;
    fromUserId?: string | null;
    toType: TextbookHolderType;
    toUserId?: string | null;
    toTeacherId?: string | null;
    toStudentId?: string | null;
    authorizedByUserId?: string | null;
    conditionAtTransfer?: string | null;
  }
): Promise<TextbookTransfer> {
  const row = em.getRepository(TextbookTransfer).create({
    copyId: args.copyId,
    fromType: args.fromType,
    fromUserId: args.fromUserId ?? null,
    toType: args.toType,
    toUserId: args.toUserId ?? null,
    toTeacherId: args.toTeacherId ?? null,
    toStudentId: args.toStudentId ?? null,
    conditionAtTransfer: args.conditionAtTransfer ?? null,
    authorizedByUserId: args.authorizedByUserId ?? null,
  });
  return await em.getRepository(TextbookTransfer).save(row);
}

function daysOverdue(due: Date, returned: Date): number {
  const ms = returned.getTime() - due.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/* ---------- Settings ---------- */

export const getInventorySettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const s = await getOrCreateSettings(AppDataSource.manager);
    return res.json(s);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const updateInventorySettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const s = await getOrCreateSettings(AppDataSource.manager);
    const b = req.body || {};
    if (b.libraryLoanDaysDefault != null) s.libraryLoanDaysDefault = Math.max(1, Number(b.libraryLoanDaysDefault) || 14);
    if (b.overdueFinePerDay != null) s.overdueFinePerDay = String(b.overdueFinePerDay);
    if (b.autoLossDaysAfterDue != null) s.autoLossDaysAfterDue = Math.max(1, Number(b.autoLossDaysAfterDue) || 30);
    await AppDataSource.getRepository(InventorySettings).save(s);
    return res.json(s);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const stockOverview = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const copyRepo = AppDataSource.getRepository(TextbookCopy);
    const furnRepo = AppDataSource.getRepository(FurnitureItem);
    const tb = await copyRepo
      .createQueryBuilder('c')
      .innerJoin('c.catalog', 'cat')
      .select('c.catalogId', 'catalogId')
      .addSelect('cat.title', 'title')
      .addSelect('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.catalogId')
      .addGroupBy('cat.title')
      .addGroupBy('c.status')
      .getRawMany();
    const fr = await furnRepo
      .createQueryBuilder('f')
      .select('f.itemType', 'itemType')
      .addSelect('f.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('f.itemType')
      .addGroupBy('f.status')
      .getRawMany();
    return res.json({
      textbookCounts: tb.map((r: any) => ({
        catalogId: r.catalogId,
        title: r.title ?? null,
        status: r.status,
        count: parseInt(r.count, 10),
      })),
      furnitureCounts: fr.map((r: any) => ({
        itemType: r.itemType,
        status: r.status,
        count: parseInt(r.count, 10),
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

/* ---------- Catalog & copies ---------- */

export const listTextbookCatalog = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const list = await AppDataSource.getRepository(TextbookCatalog).find({ order: { title: 'ASC' } });
    const copyRepo = AppDataSource.getRepository(TextbookCopy);
    const counts = await copyRepo
      .createQueryBuilder('c')
      .select('c.catalogId', 'catalogId')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('c.catalogId')
      .getRawMany();
    const byCat: Record<string, number> = {};
    for (const r of counts) byCat[r.catalogId] = parseInt(r.cnt, 10);
    const availRows = await copyRepo
      .createQueryBuilder('c')
      .select('c.catalogId', 'catalogId')
      .addSelect('COUNT(*)', 'cnt')
      .where('c.status = :st', { st: COPY_IN_STOCK })
      .groupBy('c.catalogId')
      .getRawMany();
    const byCatAvail: Record<string, number> = {};
    for (const r of availRows) byCatAvail[r.catalogId] = parseInt(r.cnt, 10);
    const total = (id: string) => byCat[id] ?? 0;
    return res.json(
      list.map(c => ({
        ...c,
        copyCount: total(c.id),
        totalCopies: total(c.id),
        availableCopies: byCatAvail[c.id] ?? 0,
      }))
    );
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const createTextbookCatalog = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const b = req.body || {};
    const row = AppDataSource.getRepository(TextbookCatalog).create({
      title: String(b.title || '').trim(),
      isbn: b.isbn != null ? String(b.isbn).trim() || null : null,
      subject: b.subject != null ? String(b.subject).trim() || null : null,
      gradeLevel: b.gradeLevel != null ? String(b.gradeLevel).trim() || null : null,
    });
    if (!row.title) return res.status(400).json({ message: 'Title required' });
    await AppDataSource.getRepository(TextbookCatalog).save(row);
    return res.status(201).json(row);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const updateTextbookCatalog = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const row = await AppDataSource.getRepository(TextbookCatalog).findOne({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ message: 'Not found' });
    const b = req.body || {};
    if (b.title != null) row.title = String(b.title).trim();
    if (b.isbn !== undefined) row.isbn = b.isbn ? String(b.isbn).trim() : null;
    if (b.subject !== undefined) row.subject = b.subject ? String(b.subject).trim() : null;
    if (b.gradeLevel !== undefined) row.gradeLevel = b.gradeLevel ? String(b.gradeLevel).trim() : null;
    await AppDataSource.getRepository(TextbookCatalog).save(row);
    return res.json(row);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const deleteTextbookCatalog = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isElevatedAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const row = await AppDataSource.getRepository(TextbookCatalog).findOne({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ message: 'Not found' });
    await AppDataSource.getRepository(TextbookCatalog).remove(row);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const addTextbookCopies = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const catalog = await AppDataSource.getRepository(TextbookCatalog).findOne({ where: { id: req.params.id } });
    if (!catalog) return res.status(404).json({ message: 'Catalog not found' });
    const count = Math.min(500, Math.max(1, Number((req.body || {}).count) || 1));
    const condition = String((req.body || {}).condition || 'good').trim() || 'good';
    const prefix = String((req.body || {}).assetTagPrefix || 'BK').trim() || 'BK';
    const created: TextbookCopy[] = [];
    await AppDataSource.transaction(async em => {
      for (let i = 0; i < count; i++) {
        const assetTag = await nextSequentialCode(em, TextbookCopy, 'assetTag', prefix, 4);
        const c = em.getRepository(TextbookCopy).create({
          catalogId: catalog.id,
          assetTag,
          condition,
          status: COPY_IN_STOCK,
        });
        await em.getRepository(TextbookCopy).save(c);
        created.push(c);
      }
    });
    return res.status(201).json({ created: created.length, copies: created });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const listTextbookCopies = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const catalogId = req.query.catalogId as string | undefined;
    const status = req.query.status as string | undefined;
    const qb = AppDataSource.getRepository(TextbookCopy)
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.catalog', 'cat')
      .orderBy('c.assetTag', 'ASC');
    if (catalogId) qb.andWhere('c.catalogId = :cid', { cid: catalogId });
    if (status) qb.andWhere('c.status = :st', { st: status });
    return res.json(await qb.getMany());
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const deleteTextbookCopy = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isElevatedAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const copyId = req.params.id;
    const copyRepo = AppDataSource.getRepository(TextbookCopy);
    const copy = await copyRepo.findOne({ where: { id: copyId } });
    if (!copy) return res.status(404).json({ message: 'Textbook copy not found' });
    if (copy.status !== COPY_IN_STOCK && copy.status !== COPY_LOST) {
      return res.status(400).json({ message: 'Only in_stock or lost copies can be deleted' });
    }
    const [permCount, xferCount] = await Promise.all([
      AppDataSource.getRepository(TextbookPermanentIssue).count({ where: { copyId, returnedAt: IsNull() } as any }),
      AppDataSource.getRepository(TextbookTransfer).count({ where: { copyId } as any }),
    ]);
    if (permCount || xferCount) {
      return res.status(400).json({ message: 'Copy has history; cannot delete' });
    }
    await copyRepo.remove(copy);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

/* ---------- Furniture ---------- */

export const listFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const itemType = req.query.itemType as string | undefined;
    const status = req.query.status as string | undefined;
    const qb = AppDataSource.getRepository(FurnitureItem).createQueryBuilder('f').orderBy('f.itemCode', 'ASC');
    if (itemType) qb.andWhere('f.itemType = :t', { t: itemType });
    if (status) qb.andWhere('f.status = :s', { s: status });
    return res.json(await qb.getMany());
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const createFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const b = req.body || {};
    const itemType = String(b.itemType || 'desk').toLowerCase();
    const count = Math.min(200, Math.max(1, Number(b.count) || 1));
    const condition = String(b.condition || 'good');
    const classroomLocation = b.classroomLocation != null ? String(b.classroomLocation).trim() || null : null;
    const prefix = itemType === 'chair' ? 'CH' : 'DK';
    const created: FurnitureItem[] = [];
    await AppDataSource.transaction(async em => {
      for (let i = 0; i < count; i++) {
        const itemCode = await nextSequentialCode(em, FurnitureItem, 'itemCode', prefix, 4);
        const f = em.getRepository(FurnitureItem).create({
          itemType,
          itemCode,
          condition,
          classroomLocation,
          status: FURN_IN_STOCK,
        });
        await em.getRepository(FurnitureItem).save(f);
        created.push(f);
      }
    });
    return res.status(201).json({ created: created.length, items: created });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const updateFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const row = await AppDataSource.getRepository(FurnitureItem).findOne({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ message: 'Not found' });
    const b = req.body || {};
    if (b.condition != null) row.condition = String(b.condition);
    if (b.classroomLocation !== undefined) row.classroomLocation = b.classroomLocation ? String(b.classroomLocation) : null;
    await AppDataSource.getRepository(FurnitureItem).save(row);
    await audit(AppDataSource.manager, {
      action: 'furniture_update',
      entityType: 'furniture',
      entityId: row.id,
      performedByUserId: req.user!.id,
    });
    return res.json(row);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

/** Admin: move in-stock desks/chairs into a class teacher's pool (`with_teacher`). */
export const transferFurnitureAdminToClassTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isElevatedAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const b = req.body || {};
    const teacherId = String(b.teacherId || '').trim();
    if (!teacherId) return res.status(400).json({ message: 'teacherId required' });
    const deskRefs = parseFurnitureRefList(b.deskRefs ?? b.deskCodes ?? b.desks);
    const chairRefs = parseFurnitureRefList(b.chairRefs ?? b.chairCodes ?? b.chairs);
    const deskCount = Math.min(500, Math.max(0, Number(b.deskCount) || 0));
    const chairCount = Math.min(500, Math.max(0, Number(b.chairCount) || 0));
    if (!deskRefs.length && !chairRefs.length && deskCount === 0 && chairCount === 0) {
      return res.status(400).json({ message: 'Provide deskRefs/chairRefs and/or deskCount/chairCount' });
    }
    const out = await AppDataSource.transaction(async em => {
      const teacher = await em.getRepository(Teacher).findOne({ where: { id: teacherId } as any });
      if (!teacher) throw Object.assign(new Error('Teacher not found'), { status: 404 });
      await assertIsClassTeacherOfAtLeastOneClass(em, teacher.id);
      const moved: FurnitureItem[] = [];
      const takeFromStock = async (itemType: 'desk' | 'chair', n: number) => {
        if (n <= 0) return;
        const items = await em.getRepository(FurnitureItem).find({
          where: { status: FURN_IN_STOCK, itemType } as any,
          order: { itemCode: 'ASC' },
          take: n,
        });
        if (items.length < n) {
          throw Object.assign(new Error(`Not enough ${itemType} in stock (need ${n}, have ${items.length})`), { status: 400 });
        }
        for (const it of items) {
          it.status = FURN_WITH_TEACHER;
          it.currentTeacherId = teacher.id;
          it.currentStudentId = null;
          await em.getRepository(FurnitureItem).save(it);
          moved.push(it);
        }
      };
      await takeFromStock('desk', deskCount);
      await takeFromStock('chair', chairCount);
      const transferOne = async (ref: string, expectType: 'desk' | 'chair') => {
        const it = await resolveFurnitureByRef(em, ref);
        if (!it) throw Object.assign(new Error(`Item not found: ${ref}`), { status: 400 });
        if (it.itemType !== expectType) throw Object.assign(new Error(`${ref} is not a ${expectType}`), { status: 400 });
        if (it.status !== FURN_IN_STOCK) throw Object.assign(new Error(`${it.itemCode} is not in stock`), { status: 400 });
        it.status = FURN_WITH_TEACHER;
        it.currentTeacherId = teacher.id;
        it.currentStudentId = null;
        await em.getRepository(FurnitureItem).save(it);
        moved.push(it);
      };
      for (const r of deskRefs) await transferOne(r, 'desk');
      for (const r of chairRefs) await transferOne(r, 'chair');
      for (const it of moved) {
        await audit(em, {
          action: 'furniture_admin_to_class_teacher',
          entityType: 'furniture',
          entityId: it.id,
          performedByUserId: req.user!.id,
          payload: { teacherId: teacher.id, itemCode: it.itemCode },
        });
      }
      return { transferred: moved.length, items: moved };
    });
    return res.json(out);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const listClassTeachersForFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isElevatedAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const classes = await AppDataSource.getRepository(Class).find({
      where: { classTeacherId: Not(IsNull()) } as any,
      relations: ['classTeacher', 'classTeacher.user'],
    });
    const map = new Map<string, any>();
    for (const c of classes) {
      const t = c.classTeacher;
      if (!t || map.has(t.id)) continue;
      map.set(t.id, {
        id: t.id,
        teacherId: t.teacherId,
        firstName: t.firstName,
        lastName: t.lastName,
        userId: t.userId,
        username: (t as any).user?.username || null,
      });
    }
    const list = [...map.values()].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, undefined, { sensitivity: 'base' })
    );
    return res.json(list);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

export const listMyFurniturePool = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isTeacherOrHodActor(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const teacher = await getActorTeacherByUserId(req.user.id);
    if (!teacher) return res.status(400).json({ message: 'Teacher profile not linked' });
    const rows = await AppDataSource.getRepository(FurnitureItem).find({
      where: { status: FURN_WITH_TEACHER, currentTeacherId: teacher.id } as any,
      order: { itemType: 'ASC', itemCode: 'ASC' },
    });
    return res.json(rows);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

/* ---------- Textbook transactions ---------- */

export const permanentIssueTextbook = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { studentId, copyId, courseLabel } = req.body || {};
    if (!studentId || !copyId) return res.status(400).json({ message: 'studentId and copyId required' });
    const result = await AppDataSource.transaction(async em => {
      const st = await em.getRepository(Student).findOne({ where: { id: studentId } });
      if (!st) throw Object.assign(new Error('Student not found'), { status: 404 });
      const copy = await em.getRepository(TextbookCopy).findOne({ where: { id: copyId } });
      if (!copy || copy.status !== COPY_IN_STOCK) throw Object.assign(new Error('Copy not available'), { status: 400 });
      const openLoan = await em.getRepository(LibraryLoan).findOne({ where: { copyId, returnedAt: IsNull() } });
      if (openLoan) throw Object.assign(new Error('Copy is on loan'), { status: 400 });
      const openPerm = await em.getRepository(TextbookPermanentIssue).findOne({ where: { copyId, returnedAt: IsNull() } });
      if (openPerm) throw Object.assign(new Error('Copy already has an active permanent issue'), { status: 400 });
      copy.status = COPY_PERM;
      copy.currentStudentId = studentId;
      await em.getRepository(TextbookCopy).save(copy);
      const issue = em.getRepository(TextbookPermanentIssue).create({
        studentId,
        copyId,
        courseLabel: courseLabel != null ? String(courseLabel).trim() || null : null,
        authorizedByUserId: req.user!.id,
      });
      await em.getRepository(TextbookPermanentIssue).save(issue);
      await audit(em, {
        action: 'permanent_issue',
        entityType: 'textbook_copy',
        entityId: copyId,
        studentId,
        performedByUserId: req.user!.id,
        payload: { issueId: issue.id },
      });
      return issue;
    });
    return res.status(201).json(result);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const permanentReturnTextbook = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { copyId, issueId } = req.body || {};
    if (!copyId && !issueId) return res.status(400).json({ message: 'copyId or issueId required' });
    await AppDataSource.transaction(async em => {
      let issue: TextbookPermanentIssue | null = null;
      if (issueId) issue = await em.getRepository(TextbookPermanentIssue).findOne({ where: { id: issueId, returnedAt: IsNull() } });
      else if (copyId) {
        let resolvedCopyId = String(copyId).trim();
        if (resolvedCopyId) {
          const copy = await em.getRepository(TextbookCopy).findOne({
            where: [{ id: resolvedCopyId } as any, { assetTag: resolvedCopyId } as any],
          });
          if (copy) resolvedCopyId = copy.id;
        }
        issue = await em
          .getRepository(TextbookPermanentIssue)
          .findOne({ where: { copyId: resolvedCopyId, returnedAt: IsNull() }, order: { issuedAt: 'DESC' } });
      }
      if (!issue) throw Object.assign(new Error('No active permanent issue found'), { status: 404 });
      const copy = await em.getRepository(TextbookCopy).findOne({ where: { id: issue.copyId } });
      if (!copy) throw Object.assign(new Error('Copy missing'), { status: 404 });
      issue.returnedAt = new Date();
      await em.getRepository(TextbookPermanentIssue).save(issue);
      copy.status = COPY_IN_STOCK;
      copy.currentStudentId = null;
      await em.getRepository(TextbookCopy).save(copy);
      await audit(em, {
        action: 'permanent_return',
        entityType: 'textbook_copy',
        entityId: issue.copyId,
        studentId: issue.studentId,
        performedByUserId: req.user!.id,
      });
    });
    return res.json({ ok: true });
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const borrowTextbook = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { studentId, copyId, dueAt, loanDays } = req.body || {};
    if (!studentId || !copyId) return res.status(400).json({ message: 'studentId and copyId required' });
    const settings = await getOrCreateSettings(AppDataSource.manager);
    const result = await AppDataSource.transaction(async em => {
      const st = await em.getRepository(Student).findOne({ where: { id: studentId } });
      if (!st) throw Object.assign(new Error('Student not found'), { status: 404 });
      const copy = await em.getRepository(TextbookCopy).findOne({ where: { id: copyId } });
      if (!copy || copy.status !== COPY_IN_STOCK) throw Object.assign(new Error('Copy not available'), { status: 400 });
      const permOpen = await em.getRepository(TextbookPermanentIssue).findOne({ where: { copyId, returnedAt: IsNull() } });
      if (permOpen) throw Object.assign(new Error('Copy has an active permanent issue'), { status: 400 });
      let due: Date;
      if (dueAt) {
        due = new Date(String(dueAt));
        if (isNaN(due.getTime())) throw Object.assign(new Error('Invalid dueAt'), { status: 400 });
      } else {
        const days = Math.max(1, Number(loanDays) || settings.libraryLoanDaysDefault);
        due = new Date();
        due.setDate(due.getDate() + days);
      }
      copy.status = COPY_LOAN;
      copy.currentStudentId = studentId;
      await em.getRepository(TextbookCopy).save(copy);
      const loan = em.getRepository(LibraryLoan).create({
        studentId,
        copyId,
        dueAt: due,
        authorizedByUserId: req.user!.id,
      });
      await em.getRepository(LibraryLoan).save(loan);
      await audit(em, {
        action: 'library_borrow',
        entityType: 'library_loan',
        entityId: loan.id,
        studentId,
        performedByUserId: req.user!.id,
      });
      return loan;
    });
    return res.status(201).json(result);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const returnLibraryLoan = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { loanId } = req.body || {};
    if (!loanId) return res.status(400).json({ message: 'loanId required' });
    const settings = await getOrCreateSettings(AppDataSource.manager);
    const out = await AppDataSource.transaction(async em => {
      const loan = await em.getRepository(LibraryLoan).findOne({ where: { id: loanId } });
      if (!loan || loan.returnedAt) throw Object.assign(new Error('Loan not found or already returned'), { status: 400 });
      const now = new Date();
      loan.returnedAt = now;
      const od = daysOverdue(loan.dueAt, now);
      loan.overdueDays = od;
      await em.getRepository(LibraryLoan).save(loan);
      const copy = await em.getRepository(TextbookCopy).findOne({ where: { id: loan.copyId } });
      if (copy) {
        copy.status = COPY_IN_STOCK;
        copy.currentStudentId = null;
        await em.getRepository(TextbookCopy).save(copy);
      }
      let fine: InventoryFine | null = null;
      if (od > 0) {
        const rate = parseFloat(String(settings.overdueFinePerDay)) || 0;
        const amt = (od * rate).toFixed(2);
        fine = em.getRepository(InventoryFine).create({
          studentId: loan.studentId,
          fineType: FINE_OVERDUE,
          amount: amt,
          status: FINE_PENDING,
          libraryLoanId: loan.id,
          notes: `${od} day(s) overdue`,
          recordedByUserId: req.user!.id,
        });
        await em.getRepository(InventoryFine).save(fine);
      }
      await audit(em, {
        action: 'library_return',
        entityType: 'library_loan',
        entityId: loan.id,
        studentId: loan.studentId,
        performedByUserId: req.user!.id,
        payload: { overdueDays: od },
      });
      return { overdueDays: od, fine };
    });
    return res.json(out);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

/* ---------- Furniture issue / revoke ---------- */

export const issueFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canIssueOrRevokeFurnitureAsStaff(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { studentId, deskItemId, chairItemId, deskId, chairId } = req.body || {};
    const desk = deskItemId || deskId;
    const chair = chairItemId || chairId;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });
    const isTeacherActor = roleStr(req.user) === UserRole.TEACHER;
    const actorTeacher = isTeacherActor ? await getActorTeacherByUserId(req.user!.id) : null;
    if (isTeacherActor && !actorTeacher) return res.status(400).json({ message: 'Teacher profile not linked' });
    const student = await AppDataSource.getRepository(Student).findOne({ where: { id: String(studentId) } as any });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (isTeacherActor) {
      const classRow = student.classId
        ? await AppDataSource.getRepository(Class).findOne({ where: { id: student.classId } as any })
        : null;
      const isClassTeacher =
        !!classRow && String((classRow as any).classTeacherId || '') === String(actorTeacher!.id);
      if (!isClassTeacher) return res.status(403).json({ message: 'Only class teachers can assign furniture to students in their assigned class' });
    }
    const row = await AppDataSource.transaction(async em => {
      // Allow incremental assignment (desk-only then chair-only) for the same student.
      const existing = await em.getRepository(FurnitureAssignment).findOne({
        where: { studentId, revokedAt: IsNull() } as any,
        relations: ['deskItem', 'chairItem'],
      });
      let deskItem: FurnitureItem | null = null;
      let chairItem: FurnitureItem | null = null;
      if (desk) {
        deskItem = await resolveFurnitureByRef(em, String(desk));
        if (!deskItem || deskItem.itemType !== 'desk') throw Object.assign(new Error('Desk not found'), { status: 400 });
        if (isTeacherActor) {
          if (deskItem.status !== FURN_WITH_TEACHER || String(deskItem.currentTeacherId || '') !== String(actorTeacher!.id)) {
            throw Object.assign(new Error('Desk is not in your furniture pool (ask admin to allocate stock to you first)'), { status: 400 });
          }
        } else if (deskItem.status !== FURN_IN_STOCK) {
          throw Object.assign(new Error('Desk not available'), { status: 400 });
        }
      }
      if (chair) {
        chairItem = await resolveFurnitureByRef(em, String(chair));
        if (!chairItem || chairItem.itemType !== 'chair') throw Object.assign(new Error('Chair not found'), { status: 400 });
        if (isTeacherActor) {
          if (chairItem.status !== FURN_WITH_TEACHER || String(chairItem.currentTeacherId || '') !== String(actorTeacher!.id)) {
            throw Object.assign(new Error('Chair is not in your furniture pool (ask admin to allocate stock to you first)'), { status: 400 });
          }
        } else if (chairItem.status !== FURN_IN_STOCK) {
          throw Object.assign(new Error('Chair not available'), { status: 400 });
        }
      }
      if (!deskItem && !chairItem) {
        throw Object.assign(new Error('Provide at least a desk or chair'), { status: 400 });
      }

      if (existing) {
        if (deskItem && existing.deskItemId) {
          throw Object.assign(new Error('Student already has a desk assigned; revoke first to change it'), { status: 400 });
        }
        if (chairItem && existing.chairItemId) {
          throw Object.assign(new Error('Student already has a chair assigned; revoke first to change it'), { status: 400 });
        }
      }

      if (deskItem) {
        deskItem.status = FURN_ASSIGNED;
        deskItem.currentStudentId = studentId;
        deskItem.currentTeacherId = null;
        await em.getRepository(FurnitureItem).save(deskItem);
      }
      if (chairItem) {
        chairItem.status = FURN_ASSIGNED;
        chairItem.currentStudentId = studentId;
        chairItem.currentTeacherId = null;
        await em.getRepository(FurnitureItem).save(chairItem);
      }
      const asg = existing
        ? Object.assign(existing, {
            deskItemId: existing.deskItemId ?? deskItem?.id ?? null,
            chairItemId: existing.chairItemId ?? chairItem?.id ?? null,
            // Ensure audit trail reflects the current actor on incremental updates.
            authorizedByUserId: req.user!.id,
          })
        : em.getRepository(FurnitureAssignment).create({
            studentId,
            deskItemId: deskItem?.id ?? null,
            chairItemId: chairItem?.id ?? null,
            authorizedByUserId: req.user!.id,
          });
      await em.getRepository(FurnitureAssignment).save(asg);
      await audit(em, {
        action: 'furniture_issue',
        entityType: 'furniture_assignment',
        entityId: asg.id,
        studentId,
        performedByUserId: req.user!.id,
      });
      return asg;
    });
    return res.status(201).json(row);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

async function releaseFurnitureItemsAfterRevoke(em: EntityManager, row: FurnitureAssignment): Promise<void> {
  const poolTeacherId = row.authorizedByUserId
    ? (await em.getRepository(Teacher).findOne({ where: { userId: row.authorizedByUserId } as any }))?.id ?? null
    : null;
  const release = async (item: FurnitureItem | null) => {
    if (!item) return;
    item.currentStudentId = null;
    if (poolTeacherId) {
      item.status = FURN_WITH_TEACHER;
      item.currentTeacherId = poolTeacherId;
    } else {
      item.status = FURN_IN_STOCK;
      item.currentTeacherId = null;
    }
    await em.getRepository(FurnitureItem).save(item);
  };
  await release(row.deskItem);
  await release(row.chairItem);
}

export const revokeFurnitureAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canIssueOrRevokeFurnitureAsStaff(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { assignmentId } = req.body || {};
    if (!assignmentId) return res.status(400).json({ message: 'assignmentId required' });
    await AppDataSource.transaction(async em => {
      const row = await em.getRepository(FurnitureAssignment).findOne({
        where: { id: assignmentId },
        relations: ['deskItem', 'chairItem', 'student'],
      });
      if (!row || row.revokedAt) throw Object.assign(new Error('Assignment not found'), { status: 404 });
      if (roleStr(req.user!) === UserRole.TEACHER) {
        const teacher = await getActorTeacherByUserId(req.user!.id);
        if (!teacher) throw Object.assign(new Error('Teacher profile not linked'), { status: 400 });
        const stu = row.student;
        if (!stu) throw Object.assign(new Error('Student not found'), { status: 400 });
        const classRow = stu.classId
          ? await em.getRepository(Class).findOne({ where: { id: stu.classId } as any })
          : null;
        const isClassTeacher =
          !!classRow && String((classRow as any).classTeacherId || '') === String(teacher.id);
        if (!isClassTeacher) {
          throw Object.assign(new Error('Only the class teacher for this student may revoke this assignment'), { status: 403 });
        }
      }
      row.revokedAt = new Date();
      await em.getRepository(FurnitureAssignment).save(row);
      await releaseFurnitureItemsAfterRevoke(em, row);
      await audit(em, {
        action: 'furniture_revoke',
        entityType: 'furniture_assignment',
        entityId: row.id,
        studentId: row.studentId,
        performedByUserId: req.user!.id,
      });
    });
    return res.json({ ok: true });
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

/* ---------- Mark lost ---------- */

export const markTextbookLost = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const copyId = req.params.id;
    const accountableStudentId = (req.body || {}).accountableStudentId as string | undefined;
    await AppDataSource.transaction(async em => {
      const copy = await em.getRepository(TextbookCopy).findOne({ where: { id: copyId } });
      if (!copy) throw Object.assign(new Error('Copy not found'), { status: 404 });
      await em.getRepository(TextbookPermanentIssue).update({ copyId, returnedAt: IsNull() }, { returnedAt: new Date() });
      const openLoan = await em.getRepository(LibraryLoan).findOne({ where: { copyId, returnedAt: IsNull() } });
      if (openLoan) {
        openLoan.returnedAt = new Date();
        await em.getRepository(LibraryLoan).save(openLoan);
      }
      copy.status = COPY_LOST;
      copy.lostAt = new Date();
      copy.currentStudentId = null;
      if (accountableStudentId) copy.accountableStudentId = accountableStudentId;
      await em.getRepository(TextbookCopy).save(copy);
      await audit(em, {
        action: 'textbook_mark_lost',
        entityType: 'textbook_copy',
        entityId: copyId,
        studentId: copy.accountableStudentId,
        performedByUserId: req.user!.id,
      });
    });
    return res.json({ ok: true });
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const markFurnitureLost = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const id = req.params.id;
    const accountableStudentId = (req.body || {}).accountableStudentId as string | undefined;
    await AppDataSource.transaction(async em => {
      const f = await em.getRepository(FurnitureItem).findOne({ where: { id } });
      if (!f) throw Object.assign(new Error('Not found'), { status: 404 });
      f.status = FURN_LOST;
      f.lostAt = new Date();
      f.currentStudentId = null;
      f.currentTeacherId = null;
      if (accountableStudentId) f.accountableStudentId = accountableStudentId;
      await em.getRepository(FurnitureItem).save(f);
      await audit(em, {
        action: 'furniture_mark_lost',
        entityType: 'furniture',
        entityId: id,
        performedByUserId: req.user!.id,
      });
    });
    return res.json({ ok: true });
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

/* ---------- Fines ---------- */

export const recordDamageFine = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { studentId, furnitureItemId, amount, notes } = req.body || {};
    if (!studentId || !amount) return res.status(400).json({ message: 'studentId and amount required' });
    const fine = AppDataSource.getRepository(InventoryFine).create({
      studentId,
      fineType: FINE_DAMAGE,
      amount: String(amount),
      status: FINE_PENDING,
      furnitureItemId: furnitureItemId || null,
      notes: notes ? String(notes) : null,
      recordedByUserId: req.user!.id,
    });
    await AppDataSource.getRepository(InventoryFine).save(fine);
    return res.status(201).json(fine);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const recordLostItemFine = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const isInventoryStaff = canManageInventory(req.user);
    const isTeacherActor = isTeacherOrHodActor(req.user);
    if (!isInventoryStaff && !isTeacherActor) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { studentId, amount, textbookCopyId, notes } = req.body || {};
    if (!studentId || !amount) return res.status(400).json({ message: 'studentId and amount required' });
    if (isTeacherActor) {
      const teacher = await getActorTeacherByUserId(req.user.id);
      if (!teacher) return res.status(400).json({ message: 'Teacher profile not linked' });
      if (!textbookCopyId) return res.status(400).json({ message: 'textbookCopyId required for teacher flow' });
      const fine = await AppDataSource.transaction(async em => {
        const copy = await em.getRepository(TextbookCopy).findOne({ where: { id: String(textbookCopyId) } as any });
        if (!copy) throw Object.assign(new Error('Textbook copy not found'), { status: 404 });
        const studentOwnsCopy = String(copy.currentStudentId || '') === String(studentId);
        const teacherOwnsCopy =
          String(copy.currentTeacherId || '') === String(teacher.id) &&
          [COPY_WITH_STUDENT, COPY_PERM, COPY_LOAN].includes(String(copy.status || '') as any);
        if (!studentOwnsCopy || !teacherOwnsCopy) {
          throw Object.assign(
            new Error('Teacher can only record lost fines for their own issued textbook currently with that student'),
            { status: 403 }
          );
        }
        const accountableForFine = copy.accountableStudentId || copy.currentStudentId;
        const openPerm = await em.getRepository(TextbookPermanentIssue).findOne({
          where: { copyId: copy.id, returnedAt: IsNull() } as any,
        });
        const openLoan = await em.getRepository(LibraryLoan).findOne({
          where: { copyId: copy.id, returnedAt: IsNull() } as any,
        });
        if (openPerm) {
          openPerm.returnedAt = new Date();
          await em.getRepository(TextbookPermanentIssue).save(openPerm);
        }
        if (openLoan) {
          openLoan.returnedAt = new Date();
          await em.getRepository(LibraryLoan).save(openLoan);
        }
        copy.status = COPY_LOST;
        copy.lostAt = new Date();
        copy.currentStudentId = null;
        if (!copy.accountableStudentId && accountableForFine) copy.accountableStudentId = accountableForFine;
        await em.getRepository(TextbookCopy).save(copy);
        const row = em.getRepository(InventoryFine).create({
          studentId,
          fineType: FINE_LOST,
          amount: String(amount),
          status: FINE_PENDING,
          textbookCopyId: copy.id,
          notes: notes ? String(notes) : null,
          recordedByUserId: req.user!.id,
        });
        await em.getRepository(InventoryFine).save(row);
        await audit(em, {
          action: 'lost_item_fine_teacher',
          entityType: 'textbook_copy',
          entityId: copy.id,
          studentId: copy.accountableStudentId,
          performedByUserId: req.user!.id,
        });
        return row;
      });
      return res.status(201).json(fine);
    }
    const fine = AppDataSource.getRepository(InventoryFine).create({
      studentId,
      fineType: FINE_LOST,
      amount: String(amount),
      status: FINE_PENDING,
      textbookCopyId: textbookCopyId || null,
      notes: notes ? String(notes) : null,
      recordedByUserId: req.user!.id,
    });
    await AppDataSource.getRepository(InventoryFine).save(fine);
    return res.status(201).json(fine);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message });
  }
};

export const markFinePaid = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const fine = await AppDataSource.getRepository(InventoryFine).findOne({ where: { id: req.params.id } });
    if (!fine) return res.status(404).json({ message: 'Not found' });
    fine.status = FINE_PAID;
    fine.paidAt = new Date();
    fine.paidRecordedByUserId = req.user!.id;
    await AppDataSource.getRepository(InventoryFine).save(fine);
    return res.json(fine);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const waiveFine = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isElevatedAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const fine = await AppDataSource.getRepository(InventoryFine).findOne({ where: { id: req.params.id } });
    if (!fine) return res.status(404).json({ message: 'Not found' });
    fine.status = FINE_WAIVED;
    await AppDataSource.getRepository(InventoryFine).save(fine);
    return res.json(fine);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

/* ---------- Summaries ---------- */

export const getStudentInventorySummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const studentId = req.params.studentId;
    assertCanViewStudent(req, studentId);
    const copies = await AppDataSource.getRepository(TextbookCopy).find({
      where: [{ currentStudentId: studentId }, { accountableStudentId: studentId }] as any,
      relations: ['catalog'],
    });
    const loans = await AppDataSource.getRepository(LibraryLoan).find({ where: { studentId } });
    const fines = await AppDataSource.getRepository(InventoryFine).find({ where: { studentId } });
    return res.json({ copies, loans, fines });
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const getMyInventorySummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const sid = authStudentId(req);
    if (!sid) return res.status(403).json({ message: 'Not a student account' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const copies = await AppDataSource.getRepository(TextbookCopy).find({
      where: [{ currentStudentId: sid }, { accountableStudentId: sid }] as any,
      relations: ['catalog'],
    });
    const loans = await AppDataSource.getRepository(LibraryLoan).find({ where: { studentId: sid } });
    const fines = await AppDataSource.getRepository(InventoryFine).find({ where: { studentId: sid } });
    return res.json({ copies, loans, fines });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

/* ---------- Reports ---------- */

export const reportLostItems = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canRunInventoryReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const from = parseOptionalDate(req.query.from);
    const to = parseOptionalDate(req.query.to);
    const studentId = req.query.studentId as string | undefined;
    const classId = req.query.classId as string | undefined;
    const category = (req.query.category as string | undefined)?.toLowerCase();
    const books: any[] = [];
    if (!category || category === 'textbook' || category === 'all') {
      const qb = AppDataSource.getRepository(TextbookCopy)
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.catalog', 'cat')
        .leftJoinAndSelect('c.accountableStudent', 'acct')
        .leftJoinAndSelect('acct.classEntity', 'cl')
        .where('c.status = :lost', { lost: COPY_LOST });
      if (studentId) qb.andWhere('c.accountableStudentId = :sid', { sid: studentId });
      if (classId) qb.andWhere('acct.classId = :cid', { cid: classId });
      const { sql, params } = reportDateClause('c.lostAt', from, to);
      if (sql !== '1=1') qb.andWhere(sql, params);
      books.push(...(await qb.getMany()));
    }
    const furniture: any[] = [];
    if (!category || category === 'furniture' || category === 'all') {
      const qb = AppDataSource.getRepository(FurnitureItem)
        .createQueryBuilder('f')
        .leftJoinAndSelect('f.accountableStudent', 'acct')
        .leftJoinAndSelect('acct.classEntity', 'cl')
        .where('f.status = :lost', { lost: FURN_LOST });
      if (studentId) qb.andWhere('f.accountableStudentId = :sid', { sid: studentId });
      if (classId) qb.andWhere('acct.classId = :cid', { cid: classId });
      const { sql, params } = reportDateClause('f.lostAt', from, to);
      if (sql !== '1=1') qb.andWhere(sql, params);
      furniture.push(...(await qb.getMany()));
    }
    return res.json({ textbooks: books, furniture });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

export const reportTextbookIssuance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canRunInventoryReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const from = parseOptionalDate(req.query.from);
    const to = parseOptionalDate(req.query.to);
    const studentId = req.query.studentId as string | undefined;
    const classId = req.query.classId as string | undefined;
    const qb = AppDataSource.getRepository(TextbookPermanentIssue)
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.student', 'st')
      .leftJoinAndSelect('st.classEntity', 'cl')
      .leftJoinAndSelect('i.copy', 'cp')
      .leftJoinAndSelect('cp.catalog', 'cat')
      .orderBy('i.issuedAt', 'DESC');
    if (studentId) qb.andWhere('i.studentId = :sid', { sid: studentId });
    if (classId) qb.andWhere('st.classId = :cid', { cid: classId });
    const { sql, params } = reportDateClause('i.issuedAt', from, to);
    if (sql !== '1=1') qb.andWhere(sql, params);
    const issues = await qb.getMany();
    return res.json(
      issues.map(i => ({
        ...i,
        copyStatus: i.copy?.status,
        active: !i.returnedAt,
      }))
    );
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

export const reportFurnitureIssuance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canRunInventoryReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const from = parseOptionalDate(req.query.from);
    const to = parseOptionalDate(req.query.to);
    const studentId = req.query.studentId as string | undefined;
    const classId = req.query.classId as string | undefined;
    const classroom = req.query.classroom as string | undefined;
    const qb = AppDataSource.getRepository(FurnitureAssignment)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.student', 'st')
      .leftJoinAndSelect('st.classEntity', 'cl')
      .leftJoinAndSelect('a.deskItem', 'desk')
      .leftJoinAndSelect('a.chairItem', 'chair')
      .orderBy('a.issuedAt', 'DESC');
    if (studentId) qb.andWhere('a.studentId = :sid', { sid: studentId });
    if (classId) qb.andWhere('st.classId = :cid', { cid: classId });
    const { sql, params } = reportDateClause('a.issuedAt', from, to);
    if (sql !== '1=1') qb.andWhere(sql, params);
    let rows = await qb.getMany();
    if (classroom) {
      const q = String(classroom).toLowerCase();
      rows = rows.filter(
        r =>
          (r.deskItem?.classroomLocation || '').toLowerCase().includes(q) ||
          (r.chairItem?.classroomLocation || '').toLowerCase().includes(q)
      );
    }
    return res.json(rows);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

/** Desks/chairs in class-teacher pools (`with_teacher`), for admin inventory reports. */
export const reportFurnitureWithClassTeachers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canRunInventoryReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const rows = await AppDataSource.getRepository(FurnitureItem)
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.currentTeacher', 't')
      .leftJoinAndSelect('t.user', 'u')
      .where('f.status = :st', { st: FURN_WITH_TEACHER })
      .andWhere('f.currentTeacherId IS NOT NULL')
      .orderBy('t.lastName', 'ASC')
      .addOrderBy('t.firstName', 'ASC')
      .addOrderBy('f.itemType', 'ASC')
      .addOrderBy('f.itemCode', 'ASC')
      .getMany();
    const items = (rows || []).map((f: any) => ({
      id: f.id,
      itemType: f.itemType,
      itemCode: f.itemCode,
      condition: f.condition,
      classroomLocation: f.classroomLocation,
      status: f.status,
      teacherRecordId: f.currentTeacherId,
      teacherStaffId: f.currentTeacher?.teacherId || null,
      teacherLastName: f.currentTeacher?.lastName || '',
      teacherFirstName: f.currentTeacher?.firstName || '',
      teacherUsername: f.currentTeacher?.user?.username || null,
    }));
    return res.json({ items });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

/** Textbook copies currently held by HODs (`with_hod`), for admin inventory reports. */
export const reportTextbooksAllocatedToHods = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canRunInventoryReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const rows = await AppDataSource.getRepository(TextbookCopy)
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.catalog', 'cat')
      .leftJoinAndSelect('c.currentHodUser', 'hodU')
      .leftJoinAndSelect('hodU.teacher', 'hodT')
      .leftJoinAndSelect('hodT.department', 'hodDept')
      .where('c.status = :st', { st: COPY_WITH_HOD })
      .andWhere('c.currentHodUserId IS NOT NULL')
      .orderBy('hodT.lastName', 'ASC')
      .addOrderBy('hodT.firstName', 'ASC')
      .addOrderBy('cat.title', 'ASC')
      .addOrderBy('c.assetTag', 'ASC')
      .getMany();
    const items = (rows || []).map((c: any) => ({
      copyId: c.id,
      bookNumber: c.assetTag || '—',
      catalogTitle: c.catalog?.title || '—',
      catalogId: c.catalogId,
      condition: c.condition,
      hodUserId: c.currentHodUserId,
      hodUsername: c.currentHodUser?.username || null,
      hodTeacherStaffId: c.currentHodUser?.teacher?.teacherId || null,
      hodLastName: c.currentHodUser?.teacher?.lastName || '',
      hodFirstName: c.currentHodUser?.teacher?.firstName || '',
      hodDepartmentName: c.currentHodUser?.teacher?.department?.name || null,
    }));
    return res.json({ items });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

function isInvalidHodTextbookHolding(c: TextbookCopy & { currentHodUser?: (User & { teacher?: Teacher | null }) | null }): boolean {
  const hodUser = (c as any).currentHodUser as (User & { teacher?: Teacher | null }) | null | undefined;
  if (!c.currentHodUserId || !hodUser) return true;
  const te = hodUser.teacher;
  if (!te) return true;
  const fn = String(te.firstName || '').trim();
  const ln = String(te.lastName || '').trim();
  if (!fn && !ln) return true;
  if (!te.departmentId) return true;
  return false;
}

/**
 * Admin: return `with_hod` copies to central stock when HOD user has no teacher row, no department,
 * or no first/last name (invalid for the HOD allocation report).
 */
export const clearInvalidHodTextbookHoldings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isElevatedAdmin(req.user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const out = await AppDataSource.transaction(async em => {
      const rows = await em
        .getRepository(TextbookCopy)
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.currentHodUser', 'hodU')
        .leftJoinAndSelect('hodU.teacher', 'hodT')
        .leftJoinAndSelect('hodT.department', 'hodDept')
        .where('c.status = :st', { st: COPY_WITH_HOD })
        .andWhere('c.currentHodUserId IS NOT NULL')
        .getMany();
      const toClear = rows.filter(c => isInvalidHodTextbookHolding(c as any));
      let cleared = 0;
      for (const c of toClear) {
        const prevHod = c.currentHodUserId;
        c.status = COPY_IN_STOCK;
        c.currentHodUserId = null;
        c.currentTeacherId = null;
        c.currentStudentId = null;
        await em.getRepository(TextbookCopy).save(c);
        await logTextbookTransfer(em, {
          copyId: c.id,
          fromType: 'hod',
          fromUserId: prevHod,
          toType: 'store',
          authorizedByUserId: req.user!.id,
          conditionAtTransfer: c.condition,
        });
        await audit(em, {
          action: 'textbook_clear_invalid_hod_holding',
          entityType: 'textbook_copy',
          entityId: c.id,
          performedByUserId: req.user!.id,
          payload: { previousHodUserId: prevHod },
        });
        cleared += 1;
      }
      return { cleared, copyIds: toClear.map(c => c.id) };
    });
    return res.json(out);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

/** Textbooks currently with students where this teacher is the issuing holder (`currentTeacherId`). */
export const reportTeacherTextbooksIssued = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isTeacherOrHodActor(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const teacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { userId: req.user.id } as any,
      relations: ['classes'],
    });
    if (!teacher) return res.status(400).json({ message: 'Teacher profile not linked to this user' });
    const classIds = (teacher.classes || []).map((c: Class) => c.id).filter(Boolean);
    if (!classIds.length) return res.json({ textbooks: [] });

    const studentInTeacherClasses = () =>
      new Brackets(qb => {
        qb.where('st.classId IN (:...classIds)', { classIds }).orWhere(
          `EXISTS (SELECT 1 FROM student_enrollments e WHERE e."studentId" = st.id AND e."classId" IN (:...classIds) AND e."isActive" = true)`
        );
      });

    const heldByStudentStatuses = [COPY_WITH_STUDENT, COPY_PERM, COPY_LOAN];

    const runTeacherAllocatedCopiesQuery = () =>
      AppDataSource.getRepository(TextbookCopy)
        .createQueryBuilder('c')
        .innerJoinAndSelect('c.currentStudent', 'st')
        .leftJoinAndSelect('st.classEntity', 'cl')
        .leftJoinAndSelect('c.catalog', 'cat')
        .where('c.currentStudentId IS NOT NULL')
        .andWhere('c.status IN (:...hs)', { hs: heldByStudentStatuses })
        .andWhere('c.currentTeacherId = :tid', { tid: teacher.id })
        .andWhere(studentInTeacherClasses())
        .orderBy('st.lastName', 'ASC')
        .addOrderBy('st.firstName', 'ASC')
        .addOrderBy('c.assetTag', 'ASC')
        .getMany();

    let copies = await runTeacherAllocatedCopiesQuery();
    let copyIds = copies.map(c => c.id);
    const loanByCopyId = new Map<string, LibraryLoan>();
    const permByCopyId = new Map<string, TextbookPermanentIssue>();
    const transferIssueAt = new Map<string, Date>();
    const latestTransferByCopyId = new Map<string, TextbookTransfer>();

    const loadLoanPermTransferMaps = async (ids: string[]) => {
      loanByCopyId.clear();
      permByCopyId.clear();
      transferIssueAt.clear();
      latestTransferByCopyId.clear();
      if (!ids.length) return;
      const loans = await AppDataSource.getRepository(LibraryLoan).find({
        where: { copyId: In(ids), returnedAt: IsNull() } as any,
      });
      for (const l of loans) loanByCopyId.set(l.copyId, l);
      const perms = await AppDataSource.getRepository(TextbookPermanentIssue).find({
        where: { copyId: In(ids), returnedAt: IsNull() } as any,
      });
      for (const p of perms) permByCopyId.set(p.copyId, p);
      const transfersAll = await AppDataSource.getRepository(TextbookTransfer).find({
        where: { copyId: In(ids) } as any,
        order: { createdAt: 'DESC' },
      });
      for (const t of transfersAll) {
        if (!latestTransferByCopyId.has(t.copyId)) latestTransferByCopyId.set(t.copyId, t);
      }
      for (const t of transfersAll) {
        if (t.toType !== 'student') continue;
        const sid = t.toStudentId;
        if (!sid) continue;
        const key = `${t.copyId}:${sid}`;
        if (!transferIssueAt.has(key)) transferIssueAt.set(key, t.createdAt);
      }
    };

    await loadLoanPermTransferMaps(copyIds);

    const staleCopyIdsForRepair = (): string[] => {
      const out = new Set<string>();
      for (const c of copies) {
        if (c.status === COPY_PERM && !permByCopyId.has(c.id)) out.add(c.id);
        else if (c.status === COPY_LOAN && !loanByCopyId.has(c.id)) out.add(c.id);
        else if (c.status === COPY_WITH_STUDENT) {
          const lt = latestTransferByCopyId.get(c.id);
          if (lt && lt.toType === 'teacher' && String(lt.toTeacherId || '') === String(teacher.id)) {
            out.add(c.id);
          }
        }
      }
      return [...out];
    };

    let repairIds = staleCopyIdsForRepair();
    if (repairIds.length) {
      await AppDataSource.transaction(async em => {
        for (const id of repairIds) {
          const copy = await em.getRepository(TextbookCopy).findOne({ where: { id } });
          if (!copy?.currentStudentId) continue;
          const openP = await em.getRepository(TextbookPermanentIssue).findOne({
            where: { copyId: id, returnedAt: IsNull() } as any,
          });
          const openL = await em.getRepository(LibraryLoan).findOne({
            where: { copyId: id, returnedAt: IsNull() } as any,
          });
          const lastTx = await em.getRepository(TextbookTransfer).find({
            where: { copyId: id } as any,
            order: { createdAt: 'DESC' },
            take: 1,
          });
          const lt = lastTx[0];
          const prevStatus = copy.status;
          let stale = false;
          let repairReason = '';
          if (prevStatus === COPY_PERM && !openP) {
            stale = true;
            repairReason = 'no_open_permanent_issue';
          } else if (prevStatus === COPY_LOAN && !openL) {
            stale = true;
            repairReason = 'no_open_loan';
          } else if (
            prevStatus === COPY_WITH_STUDENT &&
            lt &&
            lt.toType === 'teacher' &&
            String(lt.toTeacherId || '') === String(teacher.id)
          ) {
            stale = true;
            repairReason = 'last_transfer_returned_to_teacher';
          }
          if (!stale) continue;
          copy.currentStudentId = null;
          if (!copy.currentTeacherId && lt?.toTeacherId) copy.currentTeacherId = lt.toTeacherId;
          copy.status = copy.currentTeacherId ? COPY_WITH_TEACHER : COPY_IN_STOCK;
          await em.getRepository(TextbookCopy).save(copy);
          await audit(em, {
            action: 'repair_stale_textbook_holder',
            entityType: 'textbook_copy',
            entityId: id,
            performedByUserId: req.user!.id,
            payload: { reason: repairReason },
          });
        }
      });
      copies = await runTeacherAllocatedCopiesQuery();
      copyIds = copies.map(c => c.id);
      await loadLoanPermTransferMaps(copyIds);
    }

    const sidMissingClassLabel = new Set<string>();
    for (const c of copies) {
      const st = c.currentStudent as Student | undefined;
      if (st && !(st as any).classEntity?.name) sidMissingClassLabel.add(st.id);
    }
    const classNameByStudentId: Record<string, string> = {};
    if (sidMissingClassLabel.size) {
      const studs = await AppDataSource.getRepository(Student).find({
        where: { id: In([...sidMissingClassLabel]) } as any,
        relations: ['enrollments', 'enrollments.classEntity'],
      });
      for (const st of studs) {
        const enr = (st.enrollments || []).find(e => e.isActive && classIds.includes(e.classId));
        const nm = enr?.classEntity?.name;
        if (nm) classNameByStudentId[st.id] = nm;
      }
    }

    const resolveIssueAt = (c: TextbookCopy): Date | null => {
      const sid = c.currentStudentId;
      if (!sid) return null;
      if (c.status === COPY_LOAN) {
        const loan = loanByCopyId.get(c.id);
        if (loan && loan.studentId === sid) return loan.borrowedAt;
      }
      const perm = permByCopyId.get(c.id);
      if (perm && perm.studentId === sid) return perm.issuedAt;
      return transferIssueAt.get(`${c.id}:${sid}`) ?? null;
    };

    const textbooks = copies.map(c => {
      const st = c.currentStudent as Student;
      const className = (st as any).classEntity?.name || classNameByStudentId[st.id] || '—';
      const issued = resolveIssueAt(c);
      return {
        studentRecordId: st.id,
        studentId: st.studentNumber || '—',
        lastName: st.lastName || '—',
        firstName: st.firstName || '—',
        gender: st.gender || '—',
        className,
        copyId: c.id,
        bookNumber: c.assetTag || '—',
        title: c.catalog?.title || '—',
        issueDate: issued ? issued.toISOString() : null,
        /** Copies in this report always have an active student holder (DB-enforced). */
        allocationLabel: 'Allocated',
      };
    });

    return res.json({ textbooks });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

/** Active desk/chair assignments this user recorded as class teacher, for students in those classes only. */
export const reportTeacherClassFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isTeacherOrHodActor(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const teacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { userId: req.user.id } as any,
      relations: ['classes'],
    });
    if (!teacher) return res.status(400).json({ message: 'Teacher profile not linked to this user' });
    const classTeacherClassIds = (teacher.classes || [])
      .filter((c: Class) => String(c.classTeacherId || '') === String(teacher.id))
      .map((c: Class) => c.id)
      .filter(Boolean);
    if (!classTeacherClassIds.length) return res.json({ furniture: [] });

    const studentInClassTeacherClasses = () =>
      new Brackets(qb => {
        qb.where('st.classId IN (:...ctIds)', { ctIds: classTeacherClassIds }).orWhere(
          `EXISTS (SELECT 1 FROM student_enrollments e WHERE e."studentId" = st.id AND e."classId" IN (:...ctIds) AND e."isActive" = true)`
        );
      });

    const furnRows = await AppDataSource.getRepository(FurnitureAssignment)
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.student', 'st')
      .leftJoinAndSelect('st.classEntity', 'cl')
      .leftJoinAndSelect('a.deskItem', 'desk')
      .leftJoinAndSelect('a.chairItem', 'chair')
      .where('a.revokedAt IS NULL')
      .andWhere('a.authorizedByUserId = :uid', { uid: req.user.id })
      .andWhere(studentInClassTeacherClasses())
      .orderBy('st.lastName', 'ASC')
      .addOrderBy('st.firstName', 'ASC')
      .addOrderBy('a.issuedAt', 'DESC')
      .getMany();

    const furnSidMissing = new Set<string>();
    for (const a of furnRows) {
      if (!(a.student as any).classEntity?.name) furnSidMissing.add(a.student.id);
    }
    const furnClassNameByStudentId: Record<string, string> = {};
    if (furnSidMissing.size) {
      const studs = await AppDataSource.getRepository(Student).find({
        where: { id: In([...furnSidMissing]) } as any,
        relations: ['enrollments', 'enrollments.classEntity'],
      });
      for (const st of studs) {
        const enr = (st.enrollments || []).find(e => e.isActive && classTeacherClassIds.includes(e.classId));
        const nm = enr?.classEntity?.name;
        if (nm) furnClassNameByStudentId[st.id] = nm;
      }
    }

    const furniture = furnRows.map(a => {
      const st = a.student;
      const className = (st as any).classEntity?.name || furnClassNameByStudentId[st.id] || '—';
      return {
        studentId: st.studentNumber || '—',
        lastName: st.lastName || '—',
        firstName: st.firstName || '—',
        gender: st.gender || '—',
        className,
        deskCode: a.deskItem?.itemCode || '—',
        chairCode: a.chairItem?.itemCode || '—',
        deskLocation: a.deskItem?.classroomLocation || '—',
        chairLocation: a.chairItem?.classroomLocation || '—',
        issuedAt: a.issuedAt ? a.issuedAt.toISOString() : null,
      };
    });

    return res.json({ furniture });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

export const reportLoanHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canRunInventoryReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const from = parseOptionalDate(req.query.from);
    const to = parseOptionalDate(req.query.to);
    const studentId = req.query.studentId as string | undefined;
    const classId = req.query.classId as string | undefined;
    const qb = AppDataSource.getRepository(LibraryLoan)
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.student', 'st')
      .leftJoinAndSelect('st.classEntity', 'cl')
      .leftJoinAndSelect('l.copy', 'cp')
      .leftJoinAndSelect('cp.catalog', 'cat')
      .orderBy('l.borrowedAt', 'DESC');
    if (studentId) qb.andWhere('l.studentId = :sid', { sid: studentId });
    if (classId) qb.andWhere('st.classId = :cid', { cid: classId });
    const { sql, params } = reportDateClause('l.borrowedAt', from, to);
    if (sql !== '1=1') qb.andWhere(sql, params);
    const list = await qb.getMany();
    const fineByLoan: Record<string, InventoryFine[]> = {};
    const allFines = await AppDataSource.getRepository(InventoryFine).find();
    for (const f of allFines) {
      if (f.libraryLoanId) {
        fineByLoan[f.libraryLoanId] = fineByLoan[f.libraryLoanId] || [];
        fineByLoan[f.libraryLoanId].push(f);
      }
    }
    return res.json(
      list.map(l => ({
        ...l,
        fineStatus: fineByLoan[l.id]?.length
          ? fineByLoan[l.id].map(x => ({ id: x.id, status: x.status, amount: x.amount, fineType: x.fineType }))
          : [],
      }))
    );
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

export const reportFines = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canRunInventoryReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const from = parseOptionalDate(req.query.from);
    const to = parseOptionalDate(req.query.to);
    const studentId = req.query.studentId as string | undefined;
    const classId = req.query.classId as string | undefined;
    const status = req.query.status as string | undefined;
    const qb = AppDataSource.getRepository(InventoryFine)
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.student', 'st')
      .leftJoinAndSelect('st.classEntity', 'cl')
      .orderBy('f.createdAt', 'DESC');
    if (studentId) qb.andWhere('f.studentId = :sid', { sid: studentId });
    if (classId) qb.andWhere('st.classId = :cid', { cid: classId });
    if (status) qb.andWhere('f.status = :st', { st: status });
    const { sql, params } = reportDateClause('f.createdAt', from, to);
    if (sql !== '1=1') qb.andWhere(sql, params);
    const rows = await qb.getMany();
    const byStudent: Record<string, { student: any; pending: number; paid: number; waived: number; lines: InventoryFine[] }> = {};
    for (const f of rows) {
      if (!byStudent[f.studentId]) {
        byStudent[f.studentId] = { student: f.student, pending: 0, paid: 0, waived: 0, lines: [] };
      }
      byStudent[f.studentId].lines.push(f);
      const amt = Number(f.amount);
      if (f.status === FINE_PENDING) byStudent[f.studentId].pending += amt;
      else if (f.status === FINE_PAID) byStudent[f.studentId].paid += amt;
      else if (f.status === FINE_WAIVED) byStudent[f.studentId].waived += amt;
    }
    return res.json({
      summary: Object.values(byStudent),
      details: rows,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

export const listInventoryAudit = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canRunInventoryReports(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const pagination = parsePaginationParams(req.query as any, 50, 200);
    const qb = AppDataSource.getRepository(InventoryAuditLog)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.performedBy', 'u')
      .orderBy('a.createdAt', 'DESC');
    if (pagination.isPaginated) {
      const total = await qb.getCount();
      const data = await qb.skip(pagination.skip).take(pagination.limit).getMany();
      return res.json({ data, page: pagination.page, limit: pagination.limit, total });
    }
    return res.json(await qb.getMany());
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const applyAutoLossForOverdueLoans = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !canManageInventory(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const settings = await getOrCreateSettings(AppDataSource.manager);
    const graceDays = settings.autoLossDaysAfterDue || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - graceDays);
    const loans = await AppDataSource.getRepository(LibraryLoan).find({
      where: { returnedAt: IsNull() } as any,
      relations: ['copy'],
    });
    let processed = 0;
    await AppDataSource.transaction(async em => {
      for (const loan of loans) {
        if (loan.dueAt > cutoff) continue;
        const copy = await em.getRepository(TextbookCopy).findOne({ where: { id: loan.copyId } });
        if (!copy) continue;
        loan.returnedAt = new Date();
        loan.overdueDays = daysOverdue(loan.dueAt, loan.returnedAt);
        await em.getRepository(LibraryLoan).save(loan);
        copy.status = COPY_LOST;
        copy.lostAt = new Date();
        copy.currentStudentId = null;
        if (!copy.accountableStudentId) copy.accountableStudentId = loan.studentId;
        await em.getRepository(TextbookCopy).save(copy);
        processed++;
      }
    });
    return res.json({ processed });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

/* ---------- Chain-of-custody textbook transfers ---------- */

export const transferTextbooksAdminToHod = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isElevatedAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { hodUserId, copyIds, catalogId, count } = req.body || {};
    if (!hodUserId) return res.status(400).json({ message: 'hodUserId required' });
    const hod = await AppDataSource.getRepository(User).findOne({
      where: { id: String(hodUserId) } as any,
      relations: ['teacher'],
    });
    const hodOk =
      !!hod &&
      (String(hod.role).toLowerCase() === UserRole.HOD ||
        String((hod as any).teacher?.role || '').toLowerCase() === 'hod');
    if (!hodOk) return res.status(400).json({ message: 'Target user is not a HOD' });
    const out = await AppDataSource.transaction(async em => {
      let copies: TextbookCopy[] = [];
      const ids = Array.isArray(copyIds) ? [...new Set(copyIds.map((x: any) => String(x).trim()).filter(Boolean))] : [];
      if (ids.length) {
        copies = await em.getRepository(TextbookCopy).find({ where: { id: In(ids) } as any });
        const bad = copies.filter(c => c.status !== COPY_IN_STOCK);
        if (bad.length) throw Object.assign(new Error('Some copies are not in stock'), { status: 400 });
      } else {
        const qb = em.getRepository(TextbookCopy).createQueryBuilder('c').where('c.status = :st', { st: COPY_IN_STOCK });
        if (catalogId) qb.andWhere('c.catalogId = :cid', { cid: catalogId });
        qb.take(Math.min(500, Math.max(1, Number(count) || 1)));
        copies = await qb.getMany();
        if (!copies.length) throw Object.assign(new Error('No in-stock copies available'), { status: 400 });
      }
      for (const c of copies) {
        c.status = COPY_WITH_HOD;
        c.currentHodUserId = hod!.id;
        c.currentTeacherId = null;
        c.currentStudentId = null;
      }
      await em.getRepository(TextbookCopy).save(copies);
      for (const c of copies) {
        await logTextbookTransfer(em, {
          copyId: c.id,
          fromType: 'store',
          toType: 'hod',
          toUserId: hod!.id,
          authorizedByUserId: req.user!.id,
          conditionAtTransfer: c.condition,
        });
        await audit(em, {
          action: 'textbook_admin_to_hod',
          entityType: 'textbook_copy',
          entityId: c.id,
          performedByUserId: req.user!.id,
          payload: { hodUserId: hod!.id },
        });
      }
      return { transferred: copies.length };
    });
    return res.json(out);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const transferTextbooksHodToTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const actorTeacher = await getActorTeacherByUserId(req.user.id);
    const actorUserIsHod = roleStr(req.user) === UserRole.HOD || isTeacherEntityHod(actorTeacher);
    if (!actorUserIsHod) return res.status(403).json({ message: 'Forbidden' });
    const { teacherId } = req.body || {};
    if (!teacherId) return res.status(400).json({ message: 'teacherId required' });
    const teacher = await AppDataSource.getRepository(Teacher).findOne({ where: { id: String(teacherId) } as any });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    const out = await AppDataSource.transaction(async em => {
      const resolved = await resolveCopyIdsFromInputs(em, req.body || {});
      const ids = resolved.ids;
      if (!ids.length) throw Object.assign(new Error('Provide at least one BookNumber'), { status: 400 });
      const copies = await em.getRepository(TextbookCopy).find({ where: { id: In(ids) } as any });
      const found = new Set(copies.map(c => c.id));
      const missing = ids.filter(id => !found.has(id));
      if (missing.length) throw Object.assign(new Error('Some BookNumbers could not be found'), { status: 400 });
      const notHeld = copies.filter(c => c.status !== COPY_WITH_HOD || c.currentHodUserId !== req.user!.id);
      if (notHeld.length) {
        throw Object.assign(new Error('Some copies are not held by this HOD'), { status: 400 });
      }
      for (const c of copies) {
        c.status = COPY_WITH_TEACHER;
        c.currentTeacherId = teacher.id;
        c.currentStudentId = null;
        c.currentHodUserId = req.user!.id;
      }
      await em.getRepository(TextbookCopy).save(copies);
      for (const c of copies) {
        await logTextbookTransfer(em, {
          copyId: c.id,
          fromType: 'hod',
          fromUserId: req.user!.id,
          toType: 'teacher',
          toTeacherId: teacher.id,
          authorizedByUserId: req.user!.id,
          conditionAtTransfer: c.condition,
        });
        await audit(em, {
          action: 'textbook_hod_to_teacher',
          entityType: 'textbook_copy',
          entityId: c.id,
          performedByUserId: req.user!.id,
          payload: { teacherId: teacher.id },
        });
      }
      return { transferred: copies.length };
    });
    return res.json(out);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const transferTextbooksTeacherToStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (roleStr(req.user) !== UserRole.TEACHER && roleStr(req.user) !== UserRole.HOD)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const teacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { userId: req.user.id } as any,
      relations: ['classes'],
    });
    if (!teacher) return res.status(400).json({ message: 'Teacher profile not linked to this user' });
    const { studentId } = req.body || {};
    if (!studentId) return res.status(400).json({ message: 'studentId required' });
    const student = await AppDataSource.getRepository(Student).findOne({
      where: { id: String(studentId) } as any,
      relations: ['enrollments'],
    });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const classIds = (teacher.classes || []).map((c: Class) => c.id);
    const inClass =
      (student.classId && classIds.includes(student.classId)) ||
      (student.enrollments || []).some((e: any) => e.isActive && classIds.includes(e.classId));
    if (!inClass) return res.status(403).json({ message: 'Teacher cannot issue to this student/class' });
    const out = await AppDataSource.transaction(async em => {
      const resolved = await resolveCopyIdsFromInputs(em, req.body || {});
      const ids = resolved.ids;
      if (!ids.length) throw Object.assign(new Error('Provide at least one BookNumber'), { status: 400 });
      const copies = await em.getRepository(TextbookCopy).find({ where: { id: In(ids) } as any });
      const found = new Set(copies.map(c => c.id));
      const missing = ids.filter(id => !found.has(id));
      if (missing.length) throw Object.assign(new Error('Some BookNumbers could not be found'), { status: 400 });
      const notHeld = copies.filter(c => c.status !== COPY_WITH_TEACHER || c.currentTeacherId !== teacher.id);
      if (notHeld.length) throw Object.assign(new Error('Some copies are not held by this teacher'), { status: 400 });
      assertSingleCatalogPerTeacherIssueBatch(copies);
      for (const c of copies) {
        await assertStudentDoesNotHoldCatalogTitle(em, student.id, c.catalogId);
      }
      for (const c of copies) {
        c.status = COPY_WITH_STUDENT;
        c.currentTeacherId = teacher.id;
        c.currentStudentId = student.id;
        c.accountableStudentId = student.id;
      }
      await em.getRepository(TextbookCopy).save(copies);
      for (const c of copies) {
        await logTextbookTransfer(em, {
          copyId: c.id,
          fromType: 'teacher',
          toType: 'student',
          toStudentId: student.id,
          toTeacherId: teacher.id,
          authorizedByUserId: req.user!.id,
          conditionAtTransfer: c.condition,
        });
        await audit(em, {
          action: 'textbook_teacher_to_student',
          entityType: 'textbook_copy',
          entityId: c.id,
          studentId: student.id,
          performedByUserId: req.user!.id,
          payload: { teacherId: teacher.id },
        });
      }
      return { transferred: copies.length };
    });
    return res.json(out);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const returnTextbooksStudentToTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isTeacherOrHodActor(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const teacher = await AppDataSource.getRepository(Teacher).findOne({
      where: { userId: req.user.id } as any,
      relations: ['classes'],
    });
    if (!teacher) return res.status(400).json({ message: 'Teacher profile not linked to this user' });
    const classIds = (teacher.classes || []).map((cl: Class) => cl.id).filter(Boolean);
    const { condition } = req.body || {};
    const cond = normalizeCondition(condition);
    if (!cond) return res.status(400).json({ message: 'condition must be one of: good, torn, lost' });
    const out = await AppDataSource.transaction(async em => {
      const resolved = await resolveCopyIdsFromInputs(em, req.body || {});
      const ids = resolved.ids;
      if (!ids.length) throw Object.assign(new Error('Provide at least one BookNumber'), { status: 400 });
      const copies = await em.getRepository(TextbookCopy).find({ where: { id: In(ids) } as any });
      const found = new Set(copies.map(c => c.id));
      const missing = ids.filter(id => !found.has(id));
      if (missing.length) throw Object.assign(new Error('Some BookNumbers could not be found'), { status: 400 });

      const studentRecordIds = [...new Set(copies.map(c => c.currentStudentId).filter(Boolean) as string[])];
      const classScopedStudents = await em.getRepository(Student).find({
        where: { id: In(studentRecordIds) } as any,
        relations: ['enrollments'],
      });
      const studentInTeacherClasses = (st: Student): boolean => {
        if (st.classId && classIds.includes(st.classId)) return true;
        return (st.enrollments || []).some(e => e.isActive && classIds.includes(e.classId));
      };
      const allowedStudentIds = new Set(classScopedStudents.filter(studentInTeacherClasses).map(s => s.id));

      for (const c of copies) {
        if (!c.currentStudentId) {
          throw Object.assign(new Error('Copy is not allocated to a student'), { status: 400 });
        }
        if (!allowedStudentIds.has(c.currentStudentId)) {
          throw Object.assign(new Error('Some copies are not held by students in your classes'), { status: 403 });
        }
        if (c.status === COPY_WITH_STUDENT && c.currentTeacherId !== teacher.id) {
          throw Object.assign(new Error('Some copies were not issued to students by you'), { status: 400 });
        }
        if (c.status !== COPY_WITH_STUDENT && c.status !== COPY_PERM && c.status !== COPY_LOAN) {
          throw Object.assign(new Error('Some copies are not currently with a student'), { status: 400 });
        }
      }

      for (const c of copies) {
        const openPerm = await em.getRepository(TextbookPermanentIssue).findOne({
          where: { copyId: c.id, returnedAt: IsNull() } as any,
        });
        const openLoan = await em.getRepository(LibraryLoan).findOne({
          where: { copyId: c.id, returnedAt: IsNull() } as any,
        });
        const accountableForFine = c.accountableStudentId || c.currentStudentId;
        c.condition = cond;
        if (cond === 'lost') {
          if (openPerm) {
            openPerm.returnedAt = new Date();
            await em.getRepository(TextbookPermanentIssue).save(openPerm);
          }
          if (openLoan) {
            openLoan.returnedAt = new Date();
            await em.getRepository(LibraryLoan).save(openLoan);
          }
          c.status = COPY_LOST;
          c.lostAt = new Date();
          c.currentStudentId = null;
          if (!c.accountableStudentId && accountableForFine) c.accountableStudentId = accountableForFine;
        } else {
          if (openPerm) {
            openPerm.returnedAt = new Date();
            await em.getRepository(TextbookPermanentIssue).save(openPerm);
          }
          if (openLoan) {
            openLoan.returnedAt = new Date();
            await em.getRepository(LibraryLoan).save(openLoan);
          }
          c.status = COPY_WITH_TEACHER;
          c.currentStudentId = null;
          c.currentTeacherId = teacher.id;
        }
      }
      await em.getRepository(TextbookCopy).save(copies);

      if (cond === 'lost') {
        for (const c of copies) {
          const sid = c.accountableStudentId;
          if (!sid) continue;
          const fine = em.getRepository(InventoryFine).create({
            studentId: sid,
            fineType: FINE_LOST,
            amount: '0.00',
            status: FINE_PENDING,
            textbookCopyId: c.id,
            notes: 'Lost textbook copy',
            recordedByUserId: req.user!.id,
          });
          await em.getRepository(InventoryFine).save(fine);
        }
      }

      for (const c of copies) {
        await logTextbookTransfer(em, {
          copyId: c.id,
          fromType: 'student',
          toType: 'teacher',
          toTeacherId: teacher.id,
          authorizedByUserId: req.user!.id,
          conditionAtTransfer: cond,
        });
        await audit(em, {
          action: 'textbook_student_return_to_teacher',
          entityType: 'textbook_copy',
          entityId: c.id,
          performedByUserId: req.user!.id,
          payload: { teacherId: teacher.id, condition: cond },
        });
      }
      return { processed: copies.length, condition: cond };
    });
    return res.json(out);
  } catch (e: any) {
    const code = e.status || 500;
    return res.status(code).json({ message: e.message || 'Error' });
  }
};

export const listHodUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isElevatedAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const rows = await AppDataSource.getRepository(User)
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.teacher', 't')
      .leftJoinAndSelect('t.department', 'd')
      .where('(u.role = :userHodRole OR t.role = :teacherHodRole)', {
        userHodRole: UserRole.HOD,
        teacherHodRole: 'HOD',
      })
      .andWhere('u.isActive = :act', { act: true })
      .orderBy('u.createdAt', 'DESC')
      .getMany();
    return res.json(
      (rows || []).map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        teacher: u.teacher
          ? {
              id: u.teacher.id,
              teacherId: u.teacher.teacherId,
              firstName: u.teacher.firstName,
              lastName: u.teacher.lastName,
              department: u.teacher.department,
            }
          : null,
      }))
    );
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const listDepartmentTeachersForHod = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const actor = await getActorTeacherByUserId(req.user.id);
    const isHod = roleStr(req.user) === UserRole.HOD || isTeacherEntityHod(actor);
    if (!isHod || !actor?.departmentId) return res.status(403).json({ message: 'Forbidden' });
    const teachers = await AppDataSource.getRepository(Teacher).find({
      where: { departmentId: actor.departmentId } as any,
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
    return res.json(teachers);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const listMyHeldTextbooks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isTeacherOrHodActor(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const teacher = await AppDataSource.getRepository(Teacher).findOne({ where: { userId: req.user.id } as any });
    if (!teacher) return res.status(400).json({ message: 'Teacher profile not linked' });
    const rows = await AppDataSource.getRepository(TextbookCopy).find({
      where: { currentTeacherId: teacher.id, status: COPY_WITH_TEACHER } as any,
      relations: ['catalog'],
      order: { assetTag: 'ASC' },
    });
    return res.json(rows);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

/** Students in a class who already hold an active copy of this catalog (for quick-issue UI). */
export const listBlockedStudentsForTextbookIssue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !isTeacherOrHodActor(req.user)) return res.status(403).json({ message: 'Forbidden' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const classId = String(req.query.classId || '').trim();
    const catalogId = String(req.query.catalogId || '').trim();
    if (!classId || !catalogId) {
      return res.status(400).json({ message: 'classId and catalogId query parameters are required' });
    }
    const actor = await getActorTeacherByUserId(req.user.id);
    if (!actor) return res.status(400).json({ message: 'Teacher profile not linked' });
    const teaches = (actor.classes || []).some((cl: Class) => String(cl.id) === classId);
    if (!teaches) return res.status(403).json({ message: 'You do not teach this class' });
    const out = await AppDataSource.transaction(async em => {
      const sids = await studentIdsInActiveClass(em, classId);
      if (!sids.length) return { blockedStudentIds: [] as string[] };
      const rows = await em.getRepository(TextbookCopy).find({
        where: {
          catalogId,
          currentStudentId: In(sids),
          status: In(STUDENT_HOLDS_COPY_STATUSES),
        } as any,
        select: ['currentStudentId'],
      });
      const blocked = [...new Set(rows.map(r => r.currentStudentId).filter(Boolean) as string[])];
      return { blockedStudentIds: blocked };
    });
    return res.json(out);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

/** Copies currently with teachers under this HOD's chain (`with_teacher` + this HOD user on the copy). */
export const countHodIssuedToTeachers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const actorTeacher = await getActorTeacherByUserId(req.user.id);
    const actorUserIsHod = roleStr(req.user) === UserRole.HOD || isTeacherEntityHod(actorTeacher);
    if (!actorUserIsHod) return res.status(403).json({ message: 'Forbidden' });
    const issuedToTeachers = await AppDataSource.getRepository(TextbookCopy).count({
      where: { status: COPY_WITH_TEACHER, currentHodUserId: req.user.id } as any,
    });
    return res.json({ issuedToTeachers });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};
