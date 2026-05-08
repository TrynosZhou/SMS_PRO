import { Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Department } from '../entities/Department';
import { Subject } from '../entities/Subject';
import { AuthRequest } from '../middleware/auth';

function normalizeDepartmentName(input: unknown): string {
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export const listDepartments = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const rows = await AppDataSource.getRepository(Department).find({
      order: { name: 'ASC' },
      relations: ['subjects'],
    });
    // Plain objects only — spreading TypeORM entities can create circular JSON (Department ↔ Subject).
    const payload = (rows || []).map((d) => ({
      id: d.id,
      name: d.name,
      isActive: d.isActive,
      createdAt: d.createdAt,
      subjects: (d.subjects || [])
        .filter((s) => s.isActive !== false)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          category: s.category,
          departmentId: s.departmentId ?? null,
        })),
    }));
    return res.json(payload);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const name = normalizeDepartmentName(req.body?.name);
    if (!name) return res.status(400).json({ message: 'Department name is required' });

    const repo = AppDataSource.getRepository(Department);
    const exists = await repo.findOne({ where: { name } as any });
    if (exists) return res.status(409).json({ message: 'Department already exists' });

    const row = repo.create({ name, isActive: true });
    await repo.save(row);
    return res.status(201).json(row);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

export const updateDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ message: 'Department id is required' });

    const repo = AppDataSource.getRepository(Department);
    const row = await repo.findOne({ where: { id } as any });
    if (!row) return res.status(404).json({ message: 'Department not found' });

    const name = req.body?.name !== undefined ? normalizeDepartmentName(req.body?.name) : undefined;
    const isActive = req.body?.isActive;

    if (name !== undefined) {
      if (!name) return res.status(400).json({ message: 'Department name cannot be empty' });
      const other = await repo
        .createQueryBuilder('d')
        .where('d.name = :name AND d.id <> :id', { name, id })
        .getOne();
      if (other) return res.status(409).json({ message: 'Another department with this name already exists' });
      row.name = name;
    }
    if (isActive !== undefined) {
      row.isActive = Boolean(isActive);
    }

    await repo.save(row);
    return res.json(row);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

export const deleteDepartment = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ message: 'Department id is required' });

    const repo = AppDataSource.getRepository(Department);
    const row = await repo.findOne({ where: { id } as any });
    if (!row) return res.status(404).json({ message: 'Department not found' });

    await repo.remove(row);
    return res.json({ message: 'Deleted' });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

/**
 * Replace which subjects belong to a department (each subject may belong to at most one department).
 * Body: { subjectIds: string[] }
 */
export const updateDepartmentSubjects = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const deptId = String(req.params?.id || '').trim();
    if (!deptId) return res.status(400).json({ message: 'Department id is required' });

    const deptRepo = AppDataSource.getRepository(Department);
    const dep = await deptRepo.findOne({ where: { id: deptId } as any });
    if (!dep) return res.status(404).json({ message: 'Department not found' });

    const raw = req.body?.subjectIds;
    const subjectIds = Array.isArray(raw)
      ? [...new Set(raw.map((x: unknown) => String(x ?? '').trim()).filter(Boolean))]
      : [];

    await AppDataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(Subject)
        .set({ departmentId: null })
        .where('"departmentId" = :deptId', { deptId })
        .execute();

      if (subjectIds.length > 0) {
        const existing = await manager.find(Subject, {
          where: { id: In(subjectIds) },
        });
        const foundIds = new Set(existing.map((s) => s.id));
        for (const sid of subjectIds) {
          if (!foundIds.has(sid)) continue;
          await manager.update(Subject, { id: sid }, { departmentId: deptId });
        }
      }
    });

    const updated = await deptRepo.findOne({
      where: { id: deptId } as any,
      relations: ['subjects'],
    });
    const subjects = (updated?.subjects || [])
      .filter((s) => s.isActive !== false)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        category: s.category,
        departmentId: s.departmentId,
      }));

    const departmentJson = {
      id: updated!.id,
      name: updated!.name,
      isActive: updated!.isActive,
      createdAt: updated!.createdAt,
      subjects,
    };
    return res.json({ message: 'Subjects updated', department: departmentJson });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Error' });
  }
};

