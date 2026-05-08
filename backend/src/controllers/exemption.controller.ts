import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { StudentFeeExemption, FeeExemptionType } from '../entities/StudentFeeExemption';
import { Student } from '../entities/Student';
import { AuthRequest } from '../middleware/auth';
import { Repository } from 'typeorm';
import { recalculateOpenFeeInvoicesForStudent } from '../utils/recalculateOpenFeeInvoicesForStudent';

const VALID_TYPES: FeeExemptionType[] = ['fixed', 'percentage', 'staff_sibling'];

async function deactivateOtherExemptions(
  repo: Repository<StudentFeeExemption>,
  studentId: string,
  exceptId?: string
): Promise<void> {
  const qb = repo
    .createQueryBuilder()
    .update(StudentFeeExemption)
    .set({ isActive: false })
    .where('studentId = :studentId', { studentId });
  if (exceptId) {
    qb.andWhere('id != :exceptId', { exceptId });
  }
  await qb.execute();
}

function validatePayload(
  exemptionType: unknown,
  value: unknown
): { ok: true; type: FeeExemptionType; numValue: number } | { ok: false; message: string } {
  if (typeof exemptionType !== 'string' || !VALID_TYPES.includes(exemptionType as FeeExemptionType)) {
    return { ok: false, message: 'Invalid exemption type. Use fixed, percentage, or staff_sibling.' };
  }
  const type = exemptionType as FeeExemptionType;
  let numValue = Number(value);
  if (!Number.isFinite(numValue)) numValue = 0;

  if (type === 'staff_sibling') {
    return { ok: true, type, numValue: 0 };
  }
  if (type === 'percentage') {
    if (numValue <= 0 || numValue > 100) {
      return { ok: false, message: 'Percentage must be between 0 and 100.' };
    }
    return { ok: true, type, numValue };
  }
  if (type === 'fixed') {
    if (numValue <= 0) {
      return { ok: false, message: 'Fixed amount must be greater than zero.' };
    }
    return { ok: true, type, numValue };
  }
  return { ok: false, message: 'Invalid exemption type.' };
}

export const listFeeExemptions = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const repo = AppDataSource.getRepository(StudentFeeExemption);
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';

    const qb = repo
      .createQueryBuilder('ex')
      .leftJoinAndSelect('ex.student', 'student')
      .orderBy('ex.updatedAt', 'DESC');

    if (studentId) {
      qb.where('ex.studentId = :studentId', { studentId });
    }

    const exemptions = await qb.getMany();
    res.json({ exemptions });
  } catch (error: any) {
    console.error('[Exemptions] list:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getFeeExemptionsByStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const { studentId } = req.params;
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }
    const repo = AppDataSource.getRepository(StudentFeeExemption);
    const exemptions = await repo.find({
      where: { studentId },
      order: { updatedAt: 'DESC' },
      relations: ['student'],
    });
    res.json({ exemptions });
  } catch (error: any) {
    console.error('[Exemptions] by student:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const createFeeExemption = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const { studentId, exemptionType, value, description, isActive } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: 'Student is required' });
    }

    const studentRepo = AppDataSource.getRepository(Student);
    const student = await studentRepo.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const validated = validatePayload(exemptionType, value);
    if (validated.ok === false) {
      return res.status(400).json({ message: validated.message });
    }

    const active = isActive !== false;
    const repo = AppDataSource.getRepository(StudentFeeExemption);

    if (active) {
      await deactivateOtherExemptions(repo, studentId);
    }

    const row = repo.create({
      studentId,
      exemptionType: validated.type,
      value: validated.numValue,
      description: description != null && String(description).trim() ? String(description).trim() : null,
      isActive: active,
    });

    const saved = await repo.save(row);
    const withStudent = await repo.findOne({
      where: { id: saved.id },
      relations: ['student'],
    });

    let invoicesRecalculated = 0;
    let recalculationNotes: string[] | undefined;
    if (active) {
      const recalc = await recalculateOpenFeeInvoicesForStudent(AppDataSource, studentId);
      invoicesRecalculated = recalc.updated;
      recalculationNotes = recalc.errors.length ? recalc.errors : undefined;
    }

    res.status(201).json({
      message: 'Exemption created',
      exemption: withStudent,
      invoicesRecalculated,
      recalculationNotes,
    });
  } catch (error: any) {
    console.error('[Exemptions] create:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const updateFeeExemption = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const { id } = req.params;
    const { exemptionType, value, description, isActive } = req.body;

    const repo = AppDataSource.getRepository(StudentFeeExemption);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Exemption not found' });
    }

    const typeToUse = exemptionType !== undefined ? exemptionType : existing.exemptionType;
    const valueToUse = value !== undefined ? value : existing.value;
    const validated = validatePayload(typeToUse, valueToUse);
    if (validated.ok === false) {
      return res.status(400).json({ message: validated.message });
    }

    if (isActive === true) {
      await deactivateOtherExemptions(repo, existing.studentId, id);
    }

    existing.exemptionType = validated.type;
    existing.value = validated.numValue;
    if (description !== undefined) {
      existing.description =
        description != null && String(description).trim() ? String(description).trim() : null;
    }
    if (isActive !== undefined) {
      existing.isActive = Boolean(isActive);
    }

    await repo.save(existing);
    const withStudent = await repo.findOne({ where: { id }, relations: ['student'] });

    const recalc = await recalculateOpenFeeInvoicesForStudent(AppDataSource, existing.studentId);
    res.json({
      message: 'Exemption updated',
      exemption: withStudent,
      invoicesRecalculated: recalc.updated,
      recalculationNotes: recalc.errors.length ? recalc.errors : undefined,
    });
  } catch (error: any) {
    console.error('[Exemptions] update:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Re-run fee + exemption rules on all **open** invoices for a student (e.g. after data fixes).
 */
export const recalculateFeeInvoicesForStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const studentRepo = AppDataSource.getRepository(Student);
    let studentId = typeof req.body?.studentId === 'string' ? req.body.studentId.trim() : '';
    const studentNumber =
      typeof req.body?.studentNumber === 'string' ? req.body.studentNumber.trim() : '';
    if (!studentId && studentNumber) {
      const st = await studentRepo.findOne({ where: { studentNumber } });
      if (!st) {
        return res.status(404).json({ message: 'No student found with that student number' });
      }
      studentId = st.id;
    }
    if (!studentId) {
      return res.status(400).json({ message: 'studentId or studentNumber is required' });
    }
    const recalc = await recalculateOpenFeeInvoicesForStudent(AppDataSource, studentId);
    res.json({
      message:
        recalc.updated > 0
          ? `Recalculated ${recalc.updated} open invoice(s).`
          : 'No open term invoices to recalculate (or none matched fee criteria).',
      updated: recalc.updated,
      errors: recalc.errors,
    });
  } catch (error: any) {
    console.error('[Exemptions] recalculate invoices:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const deleteFeeExemption = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const { id } = req.params;
    const repo = AppDataSource.getRepository(StudentFeeExemption);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Exemption not found' });
    }
    const studentId = existing.studentId;
    existing.isActive = false;
    await repo.save(existing);

    const recalc = await recalculateOpenFeeInvoicesForStudent(AppDataSource, studentId);
    res.json({
      message: 'Exemption removed',
      exemption: existing,
      invoicesRecalculated: recalc.updated,
      recalculationNotes: recalc.errors.length ? recalc.errors : undefined,
    });
  } catch (error: any) {
    console.error('[Exemptions] delete:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};
