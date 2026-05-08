import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { PayrollEmployee, EmploymentStatus } from '../entities/PayrollEmployee';
import { PayrollSalaryStructure } from '../entities/PayrollSalaryStructure';
import { PayrollSalaryComponent, SalaryComponentType } from '../entities/PayrollSalaryComponent';
import { PayrollRun, PayrollRunStatus } from '../entities/PayrollRun';
import { PayrollRunLine } from '../entities/PayrollRunLine';
import { PayrollPayslip } from '../entities/PayrollPayslip';
import { PayrollLeaveRecord, PayrollLeaveStaffType } from '../entities/PayrollLeaveRecord';
import { PayrollLeavePolicy } from '../entities/PayrollLeavePolicy';
import { PayrollLeavePayoutAudit } from '../entities/PayrollLeavePayoutAudit';
import { Teacher } from '../entities/Teacher';
import { ensurePayrollTables } from '../utils/ensurePayrollTables';
import { createPayslipPDF } from '../utils/payrollPdfGenerator';
import { Settings } from '../entities/Settings';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function getUploadsPayrollBasePath(): string {
  return path.join(__dirname, '../../../uploads/payrolls');
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** Safe PDF filename from employee full name (Windows/macOS/Linux). */
function sanitizeEmployeeFilenameBase(name: string): string {
  const base = String(name || 'Payslip')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '')
    .slice(0, 150);
  return base || 'Payslip';
}

/** Stored file on disk: prefer `Full Name.pdf`; add employee # if name already exists in folder. */
function buildPayslipStoredFilename(
  periodDir: string,
  employeeName: string,
  employeeNumber: string,
  lineId: string
): string {
  const base = sanitizeEmployeeFilenameBase(employeeName);
  const num = sanitizeEmployeeFilenameBase(employeeNumber || '');
  const candidates = [
    `${base}.pdf`,
    num ? `${base} - ${num}.pdf` : null,
    `${base} - ${lineId.slice(0, 8)}.pdf`,
    `${base} - ${lineId}.pdf`,
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (!fs.existsSync(path.join(periodDir, c))) {
      return c;
    }
  }
  return `${base} - ${lineId}.pdf`;
}

function parseIntOrUndefined(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Calendar month before `(month, year)` (handles January → December of prior year). */
function getPreviousMonthYear(month: number, year: number): { month: number; year: number } {
  if (month === 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

function formatPeriodLabel(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

const MIN_ANNUAL_LEAVE_DAYS = 30;
const EXCESS_LEAVE_ALERT_DAYS = 45;
const DEFAULT_TEACHING_TERM_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

type LeavePolicyResolved = {
  annualLeaveDaysPerYear: number;
  excessAccruedThresholdDays: number;
  maxAccrualDays: number | null;
  carryForwardCapDays: number | null;
  teachingTermMonths: number[];
  notes: string | null;
};

type UnifiedStaff = {
  staffType: PayrollLeaveStaffType;
  staffId: string;
  employeeNumber: string;
  fullName: string;
  department: string | null;
  startDate: Date;
  salaryType: string | null;
  dailyRate: number;
};

function toDateOnly(input?: any): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDaysInclusive(start: Date, end: Date): number {
  const ms = 24 * 60 * 60 * 1000;
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  if (e < s) return 0;
  return Math.floor((e - s) / ms) + 1;
}

function teachingEligibleDays(start: Date, end: Date, termMonths: Set<number>): number {
  if (end < start) return 0;
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let days = 0;
  while (cur <= last) {
    const month = cur.getMonth() + 1;
    if (termMonths.has(month)) {
      days += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function sanitizeTermMonths(raw: any): number[] {
  const arr = Array.isArray(raw) ? raw : DEFAULT_TEACHING_TERM_MONTHS;
  const clean = Array.from(new Set(arr.map((m) => Number(m)).filter((m) => Number.isFinite(m) && m >= 1 && m <= 12))).sort(
    (a, b) => a - b
  );
  return clean.length > 0 ? clean : DEFAULT_TEACHING_TERM_MONTHS;
}

async function getLeavePolicyResolved(): Promise<LeavePolicyResolved> {
  const repo = AppDataSource.getRepository(PayrollLeavePolicy);
  let row = await repo.findOne({ where: {}, order: { createdAt: 'DESC' } });
  if (!row) {
    row = repo.create({
      annualLeaveDaysPerYear: MIN_ANNUAL_LEAVE_DAYS,
      excessAccruedThresholdDays: EXCESS_LEAVE_ALERT_DAYS,
      teachingTermMonths: DEFAULT_TEACHING_TERM_MONTHS,
      maxAccrualDays: null,
      carryForwardCapDays: null,
      notes: null,
    });
    row = await repo.save(row);
  }
  const annual = Math.max(MIN_ANNUAL_LEAVE_DAYS, Number(row.annualLeaveDaysPerYear || MIN_ANNUAL_LEAVE_DAYS));
  return {
    annualLeaveDaysPerYear: annual,
    excessAccruedThresholdDays: Number(row.excessAccruedThresholdDays || EXCESS_LEAVE_ALERT_DAYS),
    maxAccrualDays: row.maxAccrualDays != null ? Number(row.maxAccrualDays) : null,
    carryForwardCapDays: row.carryForwardCapDays != null ? Number(row.carryForwardCapDays) : null,
    teachingTermMonths: sanitizeTermMonths(row.teachingTermMonths),
    notes: row.notes || null,
  };
}

const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Shared payslip PDF generation for approve, preview, and download regeneration. */
async function buildPayslipPdfBufferForRunLine(
  run: PayrollRun,
  line: PayrollRunLine,
  employeeRepo: Repository<PayrollEmployee>,
  componentRepo: Repository<PayrollSalaryComponent>,
  settingsRepo: Repository<Settings>
): Promise<Buffer> {
  const settings = await settingsRepo.findOne({ where: {}, order: { createdAt: 'DESC' } });
  const structureId = line.salaryStructureId;
  const components = structureId ? await componentRepo.find({ where: { structureId } }) : [];

  const allowances = components
    .filter((c) => c.componentType === SalaryComponentType.ALLOWANCE)
    .map((c) => ({ name: c.name, amount: Number(c.amount || 0) }));
  const deductions = components
    .filter((c) => c.componentType === SalaryComponentType.DEDUCTION)
    .map((c) => ({ name: c.name, amount: Number(c.amount || 0) }));

  const emp = await employeeRepo.findOne({ where: { id: line.employeeId } });
  const payPeriodDisplay = `${MONTH_NAMES_LONG[run.runMonth - 1]} ${run.runYear}`;
  const workedDays = new Date(run.runYear, run.runMonth, 0).getDate();
  let dateOfJoining: string | null = null;
  if (emp?.salaryEffectiveFrom) {
    dateOfJoining = new Date(emp.salaryEffectiveFrom).toISOString().slice(0, 10);
  } else if (emp?.createdAt) {
    dateOfJoining = new Date(emp.createdAt).toISOString().slice(0, 10);
  }

  // Leave accrual snapshot shown directly on payslip (preview + final PDF)
  const asOfDate = new Date(run.runYear, Math.max(0, run.runMonth - 1), new Date(run.runYear, run.runMonth, 0).getDate());
  let leaveAccruedDays = 0;
  let leaveTakenDays = 0;
  let leaveBalanceDays = 0;
  if (emp) {
    const policy = await getLeavePolicyResolved();
    const isTeaching = String(emp.designation || '').toLowerCase().includes('teacher') || String(emp.salaryType || '').toLowerCase().includes('teacher');
    const start = toDateOnly(emp.salaryEffectiveFrom) || toDateOnly(emp.createdAt) || asOfDate;
    if (asOfDate >= start) {
      const termMonths = new Set<number>(policy.teachingTermMonths);
      const eligibleDays = isTeaching ? teachingEligibleDays(start, asOfDate, termMonths) : diffDaysInclusive(start, asOfDate);
      leaveAccruedDays = round2((eligibleDays / 365) * policy.annualLeaveDaysPerYear);
      if (policy.maxAccrualDays != null && Number.isFinite(policy.maxAccrualDays)) {
        leaveAccruedDays = Math.min(leaveAccruedDays, Number(policy.maxAccrualDays));
      }
    }

    // Leave used by this employee up to asOfDate
    const leaveRepo = AppDataSource.getRepository(PayrollLeaveRecord);
    const staffType: PayrollLeaveStaffType = isTeaching ? 'teaching' : 'ancillary';
    const staffId = isTeaching
      ? (await AppDataSource.getRepository(Teacher).findOne({ where: { teacherId: emp.employeeNumber } }))?.id || emp.id
      : emp.id;
    const rows = await leaveRepo.find({
      where: { staffType, staffId },
    });
    leaveTakenDays = round2(
      rows
        .filter((r) => {
          const d = toDateOnly(r.leaveDate);
          return !!d && d <= asOfDate;
        })
        .reduce((sum, r) => sum + Number(r.days || 0), 0)
    );
    leaveBalanceDays = round2(leaveAccruedDays - leaveTakenDays);
    if (policy.carryForwardCapDays != null && Number.isFinite(policy.carryForwardCapDays)) {
      leaveBalanceDays = Math.min(leaveBalanceDays, Number(policy.carryForwardCapDays));
    }
  }

  return createPayslipPDF({
    settings: settings || null,
    periodLabel: run.periodLabel,
    payPeriodDisplay,
    dateOfJoining,
    workedDays,
    runLine: { ...line, designation: emp?.designation ?? null } as any,
    allowances,
    deductions,
    extraAllowances: Number(line.extraAllowances || 0),
    extraDeductions: Number(line.extraDeductions || 0),
    leaveAccruedDays,
    leaveTakenDays,
    leaveBalanceDays,
    leaveAsOfDate: asOfDate.toISOString().slice(0, 10),
  });
}

function generateEmployeeNumber(prefix = 'VICT', digits = 6): string {
  // Generates: VICT + 6-digit random number (zero padded)
  const max = Math.pow(10, digits);
  const n = crypto.randomInt(0, max);
  return `${prefix}${String(n).padStart(digits, '0')}`;
}

/**
 * Ensure every active Teacher has a PayrollEmployee row (employeeNumber = teacher's teacherId).
 * Teachers were previously excluded from the Salary Assignments UI, so they often had no payroll row
 * or no salaryType — which caused payroll runs to only include non-teaching staff who were assigned.
 */
async function ensurePayrollEmployeesFromTeachers(
  employeeRepo: Repository<PayrollEmployee>,
  structureRepo: Repository<PayrollSalaryStructure>
): Promise<void> {
  const teacherRepo = AppDataSource.getRepository(Teacher);
  const teachers = await teacherRepo.find({ where: { isActive: true } });
  if (teachers.length === 0) return;

  const teacherStructure = await structureRepo
    .createQueryBuilder('s')
    .where('s.isActive = :active', { active: true })
    .andWhere('(LOWER(s.salaryType) LIKE :t OR LOWER(s.name) LIKE :t)', { t: '%teacher%' })
    .orderBy('s.effectiveFrom', 'DESC')
    .addOrderBy('s.createdAt', 'DESC')
    .getOne();

  const activeCount = await structureRepo.count({ where: { isActive: true } });
  let defaultStructure = teacherStructure;
  if (!defaultStructure && activeCount === 1) {
    defaultStructure = await structureRepo.findOne({ where: { isActive: true }, order: { createdAt: 'DESC' } });
  }

  for (const t of teachers) {
    const tid = String(t.teacherId || '').trim();
    if (!tid) continue;

    const existing = await employeeRepo.findOne({ where: { employeeNumber: tid } });
    if (existing) {
      const st = existing.salaryType ? String(existing.salaryType).trim() : '';
      if (!st && defaultStructure?.salaryType) {
        existing.salaryType = defaultStructure.salaryType;
        await employeeRepo.save(existing);
      }
      continue;
    }

    const fullName = `${t.firstName || ''} ${t.lastName || ''}`.trim() || tid;
    const created = employeeRepo.create({
      employeeNumber: tid,
      fullName,
      designation: 'Teacher',
      department: null,
      salaryType: defaultStructure?.salaryType || null,
      employmentStatus: EmploymentStatus.ACTIVE,
    });
    await employeeRepo.save(created);
  }
}

/** Normalize for comparing salary type strings */
function normSalaryType(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Pick which active salary structure applies to this employee.
 * - Exact match on salaryType (case-insensitive, trimmed)
 * - If there is only ONE active structure in the system, use it for every active employee (common setup)
 * - Otherwise try a loose substring match between employee.salaryType and structure.salaryType
 */
function pickSalaryStructureForEmployee(
  emp: PayrollEmployee,
  activeStructures: PayrollSalaryStructure[]
): PayrollSalaryStructure | null {
  if (!activeStructures.length) return null;

  const st = emp.salaryType ? String(emp.salaryType).trim() : '';
  const n = normSalaryType(st);

  if (n) {
    const exact = activeStructures.find((s) => normSalaryType(s.salaryType) === n);
    if (exact) return exact;
  }

  if (activeStructures.length === 1) {
    return activeStructures[0];
  }

  if (n) {
    const loose = activeStructures.find((s) => {
      const sn = normSalaryType(s.salaryType);
      if (!sn) return false;
      return n.includes(sn) || sn.includes(n);
    });
    if (loose) return loose;
  }

  return null;
}

export const getPayrollEmployees = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const repo = AppDataSource.getRepository(PayrollEmployee);
    const search = String(req.query.search || '').trim().toLowerCase();
    const department = String(req.query.department || '').trim();
    const status = String(req.query.status || '').trim();

    const qb = repo.createQueryBuilder('e');
    if (search) {
      qb.andWhere('(LOWER(e."fullName") LIKE :q OR LOWER(e."employeeNumber") LIKE :q OR LOWER(e."department") LIKE :q)', {
        q: `%${search}%`,
      });
    }
    if (department) qb.andWhere('e."department" = :department', { department });
    if (status) qb.andWhere('e."employmentStatus" = :status', { status });

    const employees = await qb.orderBy('e."department"', 'ASC').addOrderBy('e."fullName"', 'ASC').getMany();
    return res.json({ employees });
  } catch (error: any) {
    console.error('getPayrollEmployees error:', error);
    return res.status(500).json({ message: 'Failed to fetch employees', error: error?.message || String(error) });
  }
};

export const createPayrollEmployee = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const {
      employeeNumber,
      fullName,
      designation,
      department,
      salaryType,
      bankName,
      bankAccountNumber,
      employmentStatus,
    } = req.body || {};

    if (!fullName) {
      return res.status(400).json({ message: 'fullName is required' });
    }

    const repo = AppDataSource.getRepository(PayrollEmployee);

    // Always auto-generate employeeNumber on registration.
    // If UI sends a value, we ignore it to keep consistent IDs.
    let generatedEmployeeNumber = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateEmployeeNumber('VICT', 6);
      const existing = await repo.findOne({ where: { employeeNumber: candidate } });
      if (!existing) {
        generatedEmployeeNumber = candidate;
        break;
      }
    }
    if (!generatedEmployeeNumber) {
      return res.status(500).json({ message: 'Failed to generate a unique employee number, please retry' });
    }

    const employee = repo.create({
      employeeNumber: generatedEmployeeNumber,
      fullName: String(fullName).trim(),
      designation: designation ? String(designation).trim() : null,
      department: department ? String(department).trim() : null,
      salaryType: salaryType ? String(salaryType).trim() : null,
      bankName: bankName ? String(bankName).trim() : null,
      bankAccountNumber: bankAccountNumber ? String(bankAccountNumber).trim() : null,
      employmentStatus: (employmentStatus as EmploymentStatus) || EmploymentStatus.ACTIVE,
    });

    await repo.save(employee);
    return res.status(201).json({ message: 'Employee created', employee });
  } catch (error: any) {
    console.error('createPayrollEmployee error:', error);
    return res.status(500).json({ message: 'Failed to create employee', error: error?.message || String(error) });
  }
};

export const updatePayrollEmployee = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { id } = req.params;
    const repo = AppDataSource.getRepository(PayrollEmployee);
    const employee = await repo.findOne({ where: { id } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const patch = req.body || {};
    const salaryEffectiveFrom =
      patch.salaryEffectiveFrom !== undefined
        ? patch.salaryEffectiveFrom
          ? new Date(String(patch.salaryEffectiveFrom))
          : null
        : employee.salaryEffectiveFrom;
    const loanBalanceNum =
      patch.loanBalance !== undefined ? Number(patch.loanBalance || 0) : Number((employee as any).loanBalance ?? 0);

    Object.assign(employee, {
      fullName: patch.fullName !== undefined ? String(patch.fullName).trim() : employee.fullName,
      designation: patch.designation !== undefined ? (patch.designation ? String(patch.designation).trim() : null) : employee.designation,
      department: patch.department !== undefined ? (patch.department ? String(patch.department).trim() : null) : employee.department,
      salaryType: patch.salaryType !== undefined ? (patch.salaryType ? String(patch.salaryType).trim() : null) : employee.salaryType,
      salaryEffectiveFrom,
      loanBalance: loanBalanceNum as any,
      bankName: patch.bankName !== undefined ? (patch.bankName ? String(patch.bankName).trim() : null) : employee.bankName,
      bankAccountNumber: patch.bankAccountNumber !== undefined ? (patch.bankAccountNumber ? String(patch.bankAccountNumber).trim() : null) : employee.bankAccountNumber,
      employmentStatus: patch.employmentStatus !== undefined ? (patch.employmentStatus as EmploymentStatus) : employee.employmentStatus,
    });

    await repo.save(employee);
    return res.json({ message: 'Employee updated', employee });
  } catch (error: any) {
    console.error('updatePayrollEmployee error:', error);
    return res.status(500).json({ message: 'Failed to update employee', error: error?.message || String(error) });
  }
};

export const deletePayrollEmployee = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { id } = req.params;
    const repo = AppDataSource.getRepository(PayrollEmployee);
    const employee = await repo.findOne({ where: { id } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    await repo.remove(employee);
    return res.json({ message: 'Employee deleted' });
  } catch (error: any) {
    console.error('deletePayrollEmployee error:', error);
    return res.status(500).json({ message: 'Failed to delete employee', error: error?.message || String(error) });
  }
};

export const getSalaryStructures = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const repo = AppDataSource.getRepository(PayrollSalaryStructure);
    const componentRepo = AppDataSource.getRepository(PayrollSalaryComponent);
    const salaryType = String(req.query.salaryType || '').trim();
    const where: any = {};
    if (salaryType) where.salaryType = salaryType;

    const structures = await repo.find({ where, order: { salaryType: 'ASC', createdAt: 'DESC' } });
    if (structures.length === 0) {
      return res.json({ structures: [] });
    }
    const structureIds = structures.map((s) => s.id);
    const allComponents = await componentRepo.find({
      where: { structureId: In(structureIds) },
      order: { name: 'ASC' },
    });
    const byStructure = new Map<string, PayrollSalaryComponent[]>();
    for (const c of allComponents) {
      const list = byStructure.get(c.structureId) || [];
      list.push(c);
      byStructure.set(c.structureId, list);
    }
    const structuresWithComponents = structures.map((s) => ({
      ...s,
      components: byStructure.get(s.id) || [],
    }));
    return res.json({ structures: structuresWithComponents });
  } catch (error: any) {
    console.error('getSalaryStructures error:', error);
    return res.status(500).json({ message: 'Failed to fetch salary structures', error: error?.message || String(error) });
  }
};

export const upsertSalaryStructure = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { id } = req.params;
    const {
      name,
      salaryType,
      basicSalary,
      isActive,
      components,
      effectiveFrom,
      description,
    } = req.body || {};

    const structureRepo = AppDataSource.getRepository(PayrollSalaryStructure);
    const componentRepo = AppDataSource.getRepository(PayrollSalaryComponent);

    const structure =
      id
        ? await structureRepo.findOne({ where: { id } })
        : null;

    if (id && !structure) return res.status(404).json({ message: 'Salary structure not found' });
    if (!name || !salaryType) return res.status(400).json({ message: 'name and salaryType are required' });

    const structureEntity = structureRepo.create({
      id: structure?.id,
      name: String(name).trim(),
      salaryType: String(salaryType).trim(),
      basicSalary: Number(basicSalary || 0),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
      description: description ? String(description).trim() : null,
    });

    const saved = await structureRepo.save(structureEntity);

    // Replace components
    await componentRepo.delete({ structureId: saved.id });

    if (Array.isArray(components)) {
      const toSave: PayrollSalaryComponent[] = components
        .filter((c: any) => c && c.name && c.componentType)
        .map((c: any) =>
          componentRepo.create({
            structureId: saved.id,
            componentType: c.componentType === 'deduction' ? SalaryComponentType.DEDUCTION : SalaryComponentType.ALLOWANCE,
            name: String(c.name).trim(),
            amount: Number(c.amount || 0),
          })
        );
      await componentRepo.save(toSave);
    }

    // Return with components
    const savedComponents = await componentRepo.find({ where: { structureId: saved.id } });
    return res.json({ message: 'Salary structure saved', structure: saved, components: savedComponents });
  } catch (error: any) {
    console.error('upsertSalaryStructure error:', error);
    return res.status(500).json({ message: 'Failed to save salary structure', error: error?.message || String(error) });
  }
};

export const generatePayrollRun = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    const now = new Date();
    const serverMonth = now.getMonth() + 1;
    const serverYear = now.getFullYear();
    const serverPeriodKey = serverYear * 12 + serverMonth;

    const rawM = req.body?.month;
    const rawY = req.body?.year;
    const hasM = rawM !== undefined && rawM !== null && String(rawM).trim() !== '';
    const hasY = rawY !== undefined && rawY !== null && String(rawY).trim() !== '';
    let month: number;
    let year: number;

    if (hasM !== hasY) {
      return res.status(400).json({
        message: 'Send both month and year for the payroll period, or omit both to use the current calendar month.',
      });
    }

    if (hasM && hasY) {
      month = Math.floor(Number(rawM));
      year = Math.floor(Number(rawY));
      if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12 || year < 2000 || year > 2100) {
        return res.status(400).json({ message: 'Provide a valid month (1–12) and year (2000–2100) for the payroll run.' });
      }
      const selectedKey = year * 12 + month;
      if (selectedKey > serverPeriodKey) {
        return res.status(400).json({ message: 'Cannot generate a payroll run for a future month.' });
      }
    } else {
      month = serverMonth;
      year = serverYear;
    }

    const employeeRepo = AppDataSource.getRepository(PayrollEmployee);
    const structureRepo = AppDataSource.getRepository(PayrollSalaryStructure);
    const componentRepo = AppDataSource.getRepository(PayrollSalaryComponent);
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const lineRepo = AppDataSource.getRepository(PayrollRunLine);

    await ensurePayrollEmployeesFromTeachers(employeeRepo, structureRepo);

    const activeEmployees = await employeeRepo.find({ where: { employmentStatus: EmploymentStatus.ACTIVE } });

    const periodLabel = formatPeriodLabel(month, year);

    const existingRun = await runRepo.findOne({ where: { runMonth: month, runYear: year } });
    if (existingRun) {
      return res.status(409).json({
        message: `A payroll run already exists for ${periodLabel}. Open it from the run list above, or choose a different month to generate another period.`,
        existingRunId: existingRun.id,
      });
    }

    const totalRuns = await runRepo.count();
    if (totalRuns > 0) {
      const prev = getPreviousMonthYear(month, year);
      const prevLabel = formatPeriodLabel(prev.month, prev.year);
      const prevRun = await runRepo.findOne({ where: { runMonth: prev.month, runYear: prev.year } });
      if (!prevRun) {
        return res.status(400).json({
          message: `Payroll runs must be processed in order. Create and complete the prior period (${prevLabel}) before generating ${periodLabel}.`,
        });
      }
      if (prevRun.status !== PayrollRunStatus.PAID) {
        return res.status(400).json({
          message: `The previous payroll period (${prevLabel}) must be marked as Paid before generating ${periodLabel}. Current status: ${prevRun.status}.`,
        });
      }
    }

    const run = runRepo.create({
      runMonth: month,
      runYear: year,
      periodLabel,
      status: PayrollRunStatus.DRAFT,
      createdBy: req.user?.id || null,
      notes,
    });
    const savedRun = await runRepo.save(run);

    // Prevent duplicates: delete existing lines for same run if any (shouldn't happen)
    await lineRepo.delete({ payrollRunId: savedRun.id });

    const activeStructures = await structureRepo.find({
      where: { isActive: true },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });

    const lines: PayrollRunLine[] = [];
    for (const emp of activeEmployees) {
      const chosenStructure = pickSalaryStructureForEmployee(emp, activeStructures);

      if (!chosenStructure) continue;

      const components = await componentRepo.find({ where: { structureId: chosenStructure.id } });
      const allowances = components
        .filter((c) => c.componentType === SalaryComponentType.ALLOWANCE)
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);
      const deductions = components
        .filter((c) => c.componentType === SalaryComponentType.DEDUCTION)
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      const basic = Number(chosenStructure.basicSalary || 0);
      const netSalary = basic + allowances - deductions;

      const line = lineRepo.create({
        payrollRunId: savedRun.id,
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName: emp.fullName,
        department: emp.department,
        salaryType: emp.salaryType?.trim() ? emp.salaryType : chosenStructure.salaryType,
        salaryStructureId: chosenStructure.id,
        basicSalary: basic,
        totalAllowances: allowances,
        totalDeductions: deductions,
        extraAllowances: 0,
        extraDeductions: 0,
        adjustmentNotes: null,
        netSalary,
      });
      lines.push(line);
    }

    await lineRepo.save(lines);

    const warning =
      lines.length === 0
        ? 'No payroll lines were created. Add at least one active salary structure, and ensure each active employee can be matched (salary type or a single default structure for all).'
        : activeEmployees.length > lines.length
          ? `${activeEmployees.length - lines.length} active employee(s) had no matching salary structure (add structures or align salary types).`
          : null;

    return res.status(201).json({
      message: 'Payroll run generated',
      run: savedRun,
      lineCount: lines.length,
      warning,
      appliedPeriod: { month, year, periodLabel },
    });
  } catch (error: any) {
    console.error('generatePayrollRun error:', error);
    return res.status(500).json({ message: 'Failed to generate payroll run', error: error?.message || String(error) });
  }
};

export const getPayrollRuns = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const repo = AppDataSource.getRepository(PayrollRun);
    const month = parseIntOrUndefined(req.query.month);
    const year = parseIntOrUndefined(req.query.year);

    const where: any = {};
    if (month) where.runMonth = month;
    if (year) where.runYear = year;

    const runs = await repo.find({ where, order: { runYear: 'DESC', runMonth: 'DESC' } });
    return res.json({ runs });
  } catch (error: any) {
    console.error('getPayrollRuns error:', error);
    return res.status(500).json({ message: 'Failed to fetch payroll runs', error: error?.message || String(error) });
  }
};

export const getPayrollRunDetails = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { id } = req.params;
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const lineRepo = AppDataSource.getRepository(PayrollRunLine);

    const run = await runRepo.findOne({ where: { id } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    const lines = await lineRepo.find({ where: { payrollRunId: id }, order: { employeeName: 'ASC' } });
    return res.json({ run, lines });
  } catch (error: any) {
    console.error('getPayrollRunDetails error:', error);
    return res.status(500).json({ message: 'Failed to fetch run details', error: error?.message || String(error) });
  }
};

export const adjustPayrollLine = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { id } = req.params; // payrollRunId
    const { employeeId } = req.body || {};
    const extraAllowances = Number(req.body?.extraAllowances || 0);
    const extraDeductions = Number(req.body?.extraDeductions || 0);
    const adjustmentNotes = req.body?.adjustmentNotes ? String(req.body.adjustmentNotes).trim() : null;

    if (!employeeId) return res.status(400).json({ message: 'employeeId is required' });

    const runRepo = AppDataSource.getRepository(PayrollRun);
    const lineRepo = AppDataSource.getRepository(PayrollRunLine);

    const run = await runRepo.findOne({ where: { id } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status !== PayrollRunStatus.DRAFT) {
      return res.status(400).json({ message: 'Payroll run adjustments are only allowed in draft status' });
    }

    const line = await lineRepo.findOne({ where: { payrollRunId: id, employeeId } });
    if (!line) return res.status(404).json({ message: 'Payroll line not found' });

    line.extraAllowances = extraAllowances;
    line.extraDeductions = extraDeductions;
    line.adjustmentNotes = adjustmentNotes;
    line.netSalary = Number(line.basicSalary) + Number(line.totalAllowances) + Number(line.extraAllowances) - (Number(line.totalDeductions) + Number(line.extraDeductions));

    await lineRepo.save(line);
    return res.json({ message: 'Payroll line adjusted', line });
  } catch (error: any) {
    console.error('adjustPayrollLine error:', error);
    return res.status(500).json({ message: 'Failed to adjust payroll line', error: error?.message || String(error) });
  }
};

export const approvePayrollRun = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { id } = req.params;
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const lineRepo = AppDataSource.getRepository(PayrollRunLine);
    const employeeRepo = AppDataSource.getRepository(PayrollEmployee);
    const componentRepo = AppDataSource.getRepository(PayrollSalaryComponent);
    const payslipRepo = AppDataSource.getRepository(PayrollPayslip);
    const settingsRepo = AppDataSource.getRepository(Settings);

    const run = await runRepo.findOne({ where: { id } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status !== PayrollRunStatus.DRAFT) {
      return res.status(400).json({ message: 'Payroll run can only be approved from draft status' });
    }

    const settings = await settingsRepo.findOne({ where: {}, order: { createdAt: 'DESC' } });
    const lines = await lineRepo.find({ where: { payrollRunId: id }, order: { employeeName: 'ASC' } });

    const payrollBase = getUploadsPayrollBasePath();
    const periodDir = path.join(payrollBase, run.periodLabel);
    ensureDir(periodDir);

    for (const line of lines) {
      const pdfBuffer = await buildPayslipPdfBufferForRunLine(run, line, employeeRepo, componentRepo, settingsRepo);

      const fileName = buildPayslipStoredFilename(
        periodDir,
        line.employeeName || '',
        line.employeeNumber || '',
        line.id
      );
      const filePath = path.join(periodDir, fileName);
      fs.writeFileSync(filePath, pdfBuffer);

      const relativePath = `/uploads/payrolls/${run.periodLabel}/${fileName}`;

      const existingPayslip = await payslipRepo.findOne({ where: { payrollRunLineId: line.id } });
      if (existingPayslip) {
        existingPayslip.pdfPath = relativePath;
        existingPayslip.generatedAt = new Date();
        await payslipRepo.save(existingPayslip);
      } else {
        await payslipRepo.save(
          payslipRepo.create({
            payrollRunLineId: line.id,
            employeeId: line.employeeId,
            periodLabel: run.periodLabel,
            pdfPath: relativePath,
            generatedAt: new Date(),
          })
        );
      }
    }

    run.status = PayrollRunStatus.APPROVED;
    run.approvedBy = req.user?.id || null;
    run.approvedAt = new Date();
    await runRepo.save(run);

    return res.json({ message: 'Payroll approved and payslips generated', runId: run.id });
  } catch (error: any) {
    console.error('approvePayrollRun error:', error);
    return res.status(500).json({ message: 'Failed to approve payroll run', error: error?.message || String(error) });
  }
};

export const payPayrollRun = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { id } = req.params;
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const run = await runRepo.findOne({ where: { id } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status !== PayrollRunStatus.APPROVED) {
      return res.status(400).json({ message: 'Payroll can only be marked as paid after approval' });
    }

    run.status = PayrollRunStatus.PAID;
    run.paidAt = new Date();
    await runRepo.save(run);
    return res.json({ message: 'Payroll marked as paid', runId: run.id });
  } catch (error: any) {
    console.error('payPayrollRun error:', error);
    return res.status(500).json({ message: 'Failed to mark payroll paid', error: error?.message || String(error) });
  }
};

export const getPayrollPayslips = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { runId } = req.query;
    const payslipRepo = AppDataSource.getRepository(PayrollPayslip);

    if (runId) {
      const linesRepo = AppDataSource.getRepository(PayrollRunLine);
      const lines = await linesRepo.find({ where: { payrollRunId: String(runId) }, order: { employeeName: 'ASC' } });
      const lineIds = lines.map((l) => l.id);
      if (lineIds.length === 0) {
        return res.json({ payslips: [] });
      }
      const payslips = await payslipRepo.find({ where: { payrollRunLineId: In(lineIds) } });
      const lineById = new Map(lines.map((l) => [l.id, l]));
      const enriched = payslips.map((p) => {
        const line = lineById.get(p.payrollRunLineId);
        return {
          ...p,
          employeeName: line?.employeeName || '—',
          employeeNumber: line?.employeeNumber || '',
        };
      });
      enriched.sort((a, b) => String(a.employeeName || '').localeCompare(String(b.employeeName || '')));
      return res.json({ payslips: enriched });
    }

    const payslips = await payslipRepo.find({ order: { generatedAt: 'DESC' } });
    return res.json({ payslips });
  } catch (error: any) {
    console.error('getPayrollPayslips error:', error);
    return res.status(500).json({ message: 'Failed to fetch payslips', error: error?.message || String(error) });
  }
};

export const downloadPayrollPayslip = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { id } = req.params;
    const payslipRepo = AppDataSource.getRepository(PayrollPayslip);
    const lineRepo = AppDataSource.getRepository(PayrollRunLine);
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const employeeRepo = AppDataSource.getRepository(PayrollEmployee);
    const componentRepo = AppDataSource.getRepository(PayrollSalaryComponent);
    const settingsRepo = AppDataSource.getRepository(Settings);

    const payslip = await payslipRepo.findOne({ where: { id } });
    if (!payslip) return res.status(404).json({ message: 'Payslip not found' });

    const line = await lineRepo.findOne({ where: { id: payslip.payrollRunLineId } });
    if (!line) return res.status(404).json({ message: 'Payroll line not found' });

    const run = await runRepo.findOne({ where: { id: line.payrollRunId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    // Always generate PDF with current template (do not serve stale on-disk file from old approvals)
    const pdfBuffer = await buildPayslipPdfBufferForRunLine(run, line, employeeRepo, componentRepo, settingsRepo);
    const downloadName = `${sanitizeEmployeeFilenameBase(line?.employeeName || 'Payslip')}.pdf`;

    if (payslip.pdfPath) {
      try {
        const relative = payslip.pdfPath.replace(/^\/uploads\/payrolls\//, '');
        const abs = path.join(getUploadsPayrollBasePath(), relative);
        ensureDir(path.dirname(abs));
        fs.writeFileSync(abs, pdfBuffer);
      } catch (e) {
        console.warn('downloadPayrollPayslip: could not refresh file on disk:', e);
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`);
    return res.send(Buffer.from(pdfBuffer));
  } catch (error: any) {
    console.error('downloadPayrollPayslip error:', error);
    return res.status(500).json({ message: 'Failed to download payslip', error: error?.message || String(error) });
  }
};

/** On-the-fly payslip PDF for preview (draft or approved runs). */
export const previewPayrollPayslipPdf = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { runId, lineId } = req.params;
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const lineRepo = AppDataSource.getRepository(PayrollRunLine);
    const employeeRepo = AppDataSource.getRepository(PayrollEmployee);
    const componentRepo = AppDataSource.getRepository(PayrollSalaryComponent);
    const settingsRepo = AppDataSource.getRepository(Settings);

    const run = await runRepo.findOne({ where: { id: runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    const line = await lineRepo.findOne({ where: { id: lineId, payrollRunId: runId } });
    if (!line) return res.status(404).json({ message: 'Payroll line not found for this run' });

    const pdfBuffer = await buildPayslipPdfBufferForRunLine(run, line, employeeRepo, componentRepo, settingsRepo);
    const fname = `${sanitizeEmployeeFilenameBase(line.employeeName || 'Payslip')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fname.replace(/"/g, '')}"`);
    return res.send(Buffer.from(pdfBuffer));
  } catch (error: any) {
    console.error('previewPayrollPayslipPdf error:', error);
    return res.status(500).json({ message: 'Failed to generate payslip preview', error: error?.message || String(error) });
  }
};

export const getPayrollMonthlySummary = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const month = parseIntOrUndefined(req.query.month);
    const year = parseIntOrUndefined(req.query.year);
    if (!month || !year) return res.status(400).json({ message: 'month and year are required' });

    const runRepo = AppDataSource.getRepository(PayrollRun);
    const lineRepo = AppDataSource.getRepository(PayrollRunLine);

    const run = await runRepo.findOne({ where: { runMonth: month, runYear: year }, order: { createdAt: 'DESC' } });
    if (!run) return res.json({ summary: null });

    const lines = await lineRepo.find({ where: { payrollRunId: run.id } });
    const totalNet = lines.reduce((sum, l) => sum + Number(l.netSalary || 0), 0);

    // Total allowances/deductions (including extras)
    const totalAllowances = lines.reduce((sum, l) => sum + Number(l.totalAllowances || 0) + Number(l.extraAllowances || 0), 0);
    const totalDeductions = lines.reduce((sum, l) => sum + Number(l.totalDeductions || 0) + Number(l.extraDeductions || 0), 0);

    return res.json({
      summary: {
        runId: run.id,
        periodLabel: run.periodLabel,
        status: run.status,
        employeeCount: lines.length,
        totalNetSalary: totalNet,
        totalAllowances,
        totalDeductions,
      },
    });
  } catch (error: any) {
    console.error('getPayrollMonthlySummary error:', error);
    return res.status(500).json({ message: 'Failed to fetch summary', error: error?.message || String(error) });
  }
};

export const getPayrollDepartmentReport = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const month = parseIntOrUndefined(req.query.month);
    const year = parseIntOrUndefined(req.query.year);
    const department = req.query.department ? String(req.query.department).trim() : null;

    if (!month || !year) return res.status(400).json({ message: 'month and year are required' });

    const runRepo = AppDataSource.getRepository(PayrollRun);
    const lineRepo = AppDataSource.getRepository(PayrollRunLine);

    const run = await runRepo.findOne({ where: { runMonth: month, runYear: year }, order: { createdAt: 'DESC' } });
    if (!run) return res.json({ rows: [] });

    let lines = await lineRepo.find({ where: { payrollRunId: run.id } });
    if (department) {
      lines = lines.filter((l) => String(l.department || '') === department);
    }

    const map = new Map<string, { department: string; employeeCount: number; netSalaryTotal: number }>();
    for (const l of lines) {
      const dept = l.department || 'Unassigned';
      const existing = map.get(dept) || { department: dept, employeeCount: 0, netSalaryTotal: 0 };
      existing.employeeCount += 1;
      existing.netSalaryTotal += Number(l.netSalary || 0);
      map.set(dept, existing);
    }

    const rows = Array.from(map.values()).sort((a, b) => b.netSalaryTotal - a.netSalaryTotal);
    return res.json({ rows });
  } catch (error: any) {
    console.error('getPayrollDepartmentReport error:', error);
    return res.status(500).json({ message: 'Failed to fetch department report', error: error?.message || String(error) });
  }
};

async function getUnifiedStaffForLeave(): Promise<UnifiedStaff[]> {
  const teacherRepo = AppDataSource.getRepository(Teacher);
  const payrollEmployeeRepo = AppDataSource.getRepository(PayrollEmployee);
  const salaryStructureRepo = AppDataSource.getRepository(PayrollSalaryStructure);

  const [teachers, payrollEmployees, structures] = await Promise.all([
    teacherRepo.find({ where: { isActive: true }, relations: ['user', 'department'], order: { lastName: 'ASC', firstName: 'ASC' } }),
    payrollEmployeeRepo.find({ where: { employmentStatus: EmploymentStatus.ACTIVE }, order: { fullName: 'ASC' } }),
    salaryStructureRepo.find({ where: { isActive: true }, order: { effectiveFrom: 'DESC', createdAt: 'DESC' } }),
  ]);

  const firstStructureByType = new Map<string, PayrollSalaryStructure>();
  for (const s of structures) {
    const t = String(s.salaryType || '').trim().toLowerCase();
    if (!t || firstStructureByType.has(t)) continue;
    firstStructureByType.set(t, s);
  }

  const pickBasicSalary = (salaryType: string | null, fallbackType?: string): number => {
    const keys = [salaryType, fallbackType].filter(Boolean).map((x) => String(x).trim().toLowerCase());
    for (const k of keys) {
      const st = firstStructureByType.get(k);
      if (st) return Number(st.basicSalary || 0);
    }
    return 0;
  };

  const teaching: UnifiedStaff[] = teachers.map((t) => {
    const start = toDateOnly((t.user as any)?.createdAt) || new Date();
    const basic = pickBasicSalary(null, 'teacher');
    return {
      staffType: 'teaching',
      staffId: t.id,
      employeeNumber: t.teacherId || `T-${t.id.slice(0, 8)}`,
      fullName: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.teacherId || 'Teacher',
      department: t.department?.name || null,
      startDate: start,
      salaryType: 'teacher',
      dailyRate: round2(basic / 30),
    };
  });

  const ancillary: UnifiedStaff[] = payrollEmployees.map((e) => {
    const start = toDateOnly(e.salaryEffectiveFrom) || toDateOnly(e.createdAt) || new Date();
    const basic = pickBasicSalary(e.salaryType, 'ancillary');
    return {
      staffType: 'ancillary',
      staffId: e.id,
      employeeNumber: e.employeeNumber,
      fullName: e.fullName,
      department: e.department || null,
      startDate: start,
      salaryType: e.salaryType || 'ancillary',
      dailyRate: round2(basic / 30),
    };
  });

  return [...teaching, ...ancillary];
}

function accruedDaysForStaff(staff: UnifiedStaff, asOfDate: Date, policy: LeavePolicyResolved): number {
  if (asOfDate < staff.startDate) return 0;
  const termMonths = new Set<number>(policy.teachingTermMonths);
  const days =
    staff.staffType === 'teaching'
      ? teachingEligibleDays(staff.startDate, asOfDate, termMonths)
      : diffDaysInclusive(staff.startDate, asOfDate);
  const accrued = round2((days / 365) * policy.annualLeaveDaysPerYear);
  if (policy.maxAccrualDays != null && Number.isFinite(policy.maxAccrualDays)) {
    return Math.min(accrued, Number(policy.maxAccrualDays));
  }
  return accrued;
}

export const getLeaveDashboard = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const asOfDate = toDateOnly(req.query.asOfDate) || new Date();
    const category = String(req.query.category || '').trim().toLowerCase();
    const employeeId = String(req.query.employeeId || '').trim();
    const from = toDateOnly(req.query.from);
    const to = toDateOnly(req.query.to);

    const leaveRepo = AppDataSource.getRepository(PayrollLeaveRecord);
    const policy = await getLeavePolicyResolved();
    const staff = await getUnifiedStaffForLeave();
    const filtered = staff.filter((s) => {
      if (category && category !== 'all' && s.staffType !== category) return false;
      if (employeeId && s.staffId !== employeeId) return false;
      return true;
    });

    const allLeaveRows = await leaveRepo.find();
    const leaveByStaff = new Map<string, PayrollLeaveRecord[]>();
    for (const row of allLeaveRows) {
      const key = `${row.staffType}:${row.staffId}`;
      const list = leaveByStaff.get(key) || [];
      list.push(row);
      leaveByStaff.set(key, list);
    }

    const rows = filtered.map((s) => {
      const key = `${s.staffType}:${s.staffId}`;
      const records = leaveByStaff.get(key) || [];
      const takenAllTime = round2(records.reduce((sum, r) => sum + Number(r.days || 0), 0));
      const takenInRange = round2(
        records
          .filter((r) => {
            const d = toDateOnly(r.leaveDate);
            if (!d) return false;
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
          })
          .reduce((sum, r) => sum + Number(r.days || 0), 0)
      );
      const accrued = accruedDaysForStaff(s, asOfDate, policy);
      let remaining = round2(accrued - takenAllTime);
      if (policy.carryForwardCapDays != null && Number.isFinite(policy.carryForwardCapDays)) {
        remaining = Math.min(remaining, Number(policy.carryForwardCapDays));
      }
      const leaveLiabilityPayout = round2(Math.max(remaining, 0) * (s.dailyRate || 0));
      return {
        ...s,
        accruedDays: accrued,
        takenDays: takenAllTime,
        takenDaysInRange: takenInRange,
        remainingDays: remaining,
        excessAccrued: remaining > policy.excessAccruedThresholdDays,
        leaveLiabilityPayout,
      };
    });

    rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return res.json({
      asOfDate: asOfDate.toISOString().slice(0, 10),
      policy: {
        annualLeaveDaysPerYear: policy.annualLeaveDaysPerYear,
        minimumAnnualLeaveDays: MIN_ANNUAL_LEAVE_DAYS,
        excessThresholdDays: policy.excessAccruedThresholdDays,
        maxAccrualDays: policy.maxAccrualDays,
        carryForwardCapDays: policy.carryForwardCapDays,
        teachingTermMonths: policy.teachingTermMonths,
        notes: policy.notes,
      },
      rows,
    });
  } catch (error: any) {
    console.error('getLeaveDashboard error:', error);
    return res.status(500).json({ message: 'Failed to fetch leave dashboard', error: error?.message || String(error) });
  }
};

export const createLeaveRecord = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const leaveRepo = AppDataSource.getRepository(PayrollLeaveRecord);
    const staffType = String(req.body?.staffType || '').trim().toLowerCase() as PayrollLeaveStaffType;
    const staffId = String(req.body?.staffId || '').trim();
    const days = Number(req.body?.days || 0);
    const leaveDate = toDateOnly(req.body?.leaveDate) || new Date();
    const reason = req.body?.reason ? String(req.body.reason).trim() : null;

    if (!['teaching', 'ancillary'].includes(staffType) || !staffId) {
      return res.status(400).json({ message: 'staffType (teaching|ancillary) and staffId are required.' });
    }
    if (!Number.isFinite(days) || days <= 0) {
      return res.status(400).json({ message: 'days must be a positive number.' });
    }

    const staff = await getUnifiedStaffForLeave();
    const match = staff.find((s) => s.staffType === staffType && s.staffId === staffId);
    if (!match) {
      return res.status(404).json({ message: 'Staff member not found in existing records.' });
    }

    const rec = leaveRepo.create({
      staffType,
      staffId,
      staffName: match.fullName,
      department: match.department || null,
      leaveDate,
      days: round2(days),
      reason,
      createdBy: req.user?.id || null,
    });
    const saved = await leaveRepo.save(rec);
    return res.status(201).json({ message: 'Leave recorded successfully', record: saved });
  } catch (error: any) {
    console.error('createLeaveRecord error:', error);
    return res.status(500).json({ message: 'Failed to record leave', error: error?.message || String(error) });
  }
};

export const getLeaveRecords = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const leaveRepo = AppDataSource.getRepository(PayrollLeaveRecord);
    const staffType = String(req.query.staffType || '').trim().toLowerCase();
    const staffId = String(req.query.staffId || '').trim();
    const from = toDateOnly(req.query.from);
    const to = toDateOnly(req.query.to);

    const all = await leaveRepo.find({ order: { leaveDate: 'DESC', createdAt: 'DESC' } });
    const records = all.filter((r) => {
      if (staffType && staffType !== 'all' && r.staffType !== staffType) return false;
      if (staffId && r.staffId !== staffId) return false;
      const d = toDateOnly(r.leaveDate);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      return true;
    });
    return res.json({ records });
  } catch (error: any) {
    console.error('getLeaveRecords error:', error);
    return res.status(500).json({ message: 'Failed to fetch leave records', error: error?.message || String(error) });
  }
};

export const getLeaveDepartmentSummary = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const asOfDate = toDateOnly(req.query.asOfDate) || new Date();
    const from = toDateOnly(req.query.from);
    const to = toDateOnly(req.query.to);
    const category = String(req.query.category || '').trim().toLowerCase();

    const leaveRepo = AppDataSource.getRepository(PayrollLeaveRecord);
    const policy = await getLeavePolicyResolved();
    const records = await leaveRepo.find();
    const staff = await getUnifiedStaffForLeave();
    const filteredStaff = staff.filter((s) => !category || category === 'all' || s.staffType === category);

    const byStaffKey = new Map<string, PayrollLeaveRecord[]>();
    for (const r of records) {
      const key = `${r.staffType}:${r.staffId}`;
      const list = byStaffKey.get(key) || [];
      list.push(r);
      byStaffKey.set(key, list);
    }

    const byDept = new Map<string, { department: string; category: PayrollLeaveStaffType; employees: number; usedDays: number; outstandingDays: number }>();
    for (const s of filteredStaff) {
      const key = `${s.staffType}:${s.department || 'Unassigned'}`;
      const recs = byStaffKey.get(`${s.staffType}:${s.staffId}`) || [];
      const used = round2(
        recs
          .filter((r) => {
            const d = toDateOnly(r.leaveDate);
            if (!d) return false;
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
          })
          .reduce((sum, r) => sum + Number(r.days || 0), 0)
      );
      let outstanding = round2(accruedDaysForStaff(s, asOfDate, policy) - recs.reduce((sum, r) => sum + Number(r.days || 0), 0));
      if (policy.carryForwardCapDays != null && Number.isFinite(policy.carryForwardCapDays)) {
        outstanding = Math.min(outstanding, Number(policy.carryForwardCapDays));
      }
      const cur = byDept.get(key) || {
        department: s.department || 'Unassigned',
        category: s.staffType,
        employees: 0,
        usedDays: 0,
        outstandingDays: 0,
      };
      cur.employees += 1;
      cur.usedDays = round2(cur.usedDays + used);
      cur.outstandingDays = round2(cur.outstandingDays + outstanding);
      byDept.set(key, cur);
    }

    const rows = Array.from(byDept.values()).sort((a, b) => a.department.localeCompare(b.department));
    return res.json({ rows });
  } catch (error: any) {
    console.error('getLeaveDepartmentSummary error:', error);
    return res.status(500).json({ message: 'Failed to fetch leave department summary', error: error?.message || String(error) });
  }
};

export const getLeaveLiabilityReport = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const asOfDate = toDateOnly(req.query.asOfDate) || new Date();
    const category = String(req.query.category || '').trim().toLowerCase();
    const employeeId = String(req.query.employeeId || '').trim();

    const leaveRepo = AppDataSource.getRepository(PayrollLeaveRecord);
    const records = await leaveRepo.find();
    const staff = await getUnifiedStaffForLeave();
    const policy = await getLeavePolicyResolved();
    const filteredStaff = staff.filter((s) => {
      if (category && category !== 'all' && s.staffType !== category) return false;
      if (employeeId && s.staffId !== employeeId) return false;
      return true;
    });

    const rows = filteredStaff.map((s) => {
      const recs = records.filter((r) => r.staffType === s.staffType && r.staffId === s.staffId);
      const accrued = accruedDaysForStaff(s, asOfDate, policy);
      const taken = round2(recs.reduce((sum, r) => sum + Number(r.days || 0), 0));
      let remaining = round2(accrued - taken);
      if (policy.carryForwardCapDays != null && Number.isFinite(policy.carryForwardCapDays)) {
        remaining = Math.min(remaining, Number(policy.carryForwardCapDays));
      }
      const payout = round2(Math.max(remaining, 0) * (s.dailyRate || 0));
      return {
        staffType: s.staffType,
        staffId: s.staffId,
        employeeNumber: s.employeeNumber,
        fullName: s.fullName,
        department: s.department || 'Unassigned',
        remainingDays: remaining,
        dailyRate: s.dailyRate || 0,
        payoutAmount: payout,
      };
    });

    const totalPayout = round2(rows.reduce((sum, r) => sum + r.payoutAmount, 0));
    const totalOutstandingDays = round2(rows.reduce((sum, r) => sum + r.remainingDays, 0));
    rows.sort((a, b) => b.payoutAmount - a.payoutAmount);
    return res.json({
      asOfDate: asOfDate.toISOString().slice(0, 10),
      totals: { employees: rows.length, totalOutstandingDays, totalPayout },
      rows,
    });
  } catch (error: any) {
    console.error('getLeaveLiabilityReport error:', error);
    return res.status(500).json({ message: 'Failed to fetch leave liability report', error: error?.message || String(error) });
  }
};

export const getLeavePolicy = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const policy = await getLeavePolicyResolved();
    return res.json({ policy });
  } catch (error: any) {
    console.error('getLeavePolicy error:', error);
    return res.status(500).json({ message: 'Failed to fetch leave policy', error: error?.message || String(error) });
  }
};

export const updateLeavePolicy = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(PayrollLeavePolicy);
    let row = await repo.findOne({ where: {}, order: { createdAt: 'DESC' } });
    if (!row) {
      row = repo.create();
    }
    const annual = Number(req.body?.annualLeaveDaysPerYear ?? row.annualLeaveDaysPerYear ?? MIN_ANNUAL_LEAVE_DAYS);
    if (!Number.isFinite(annual) || annual < MIN_ANNUAL_LEAVE_DAYS) {
      return res.status(400).json({ message: `annualLeaveDaysPerYear must be at least ${MIN_ANNUAL_LEAVE_DAYS} days/year.` });
    }
    const termMonths = sanitizeTermMonths(req.body?.teachingTermMonths ?? row.teachingTermMonths);
    row.annualLeaveDaysPerYear = annual;
    row.excessAccruedThresholdDays = Number(req.body?.excessAccruedThresholdDays ?? row.excessAccruedThresholdDays ?? EXCESS_LEAVE_ALERT_DAYS);
    row.maxAccrualDays =
      req.body?.maxAccrualDays === null || req.body?.maxAccrualDays === '' ? null : Number(req.body?.maxAccrualDays ?? row.maxAccrualDays ?? null);
    row.carryForwardCapDays =
      req.body?.carryForwardCapDays === null || req.body?.carryForwardCapDays === '' ? null : Number(req.body?.carryForwardCapDays ?? row.carryForwardCapDays ?? null);
    row.teachingTermMonths = termMonths;
    row.notes = req.body?.notes != null ? String(req.body.notes).trim() : row.notes;
    const saved = await repo.save(row);
    return res.json({ message: 'Leave policy updated', policy: await getLeavePolicyResolved(), raw: saved });
  } catch (error: any) {
    console.error('updateLeavePolicy error:', error);
    return res.status(500).json({ message: 'Failed to update leave policy', error: error?.message || String(error) });
  }
};

export const createLeaveLiabilityAudit = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const asOfDate = toDateOnly(req.body?.asOfDate || req.query.asOfDate) || new Date();
    const category = String(req.body?.category || req.query.category || '').trim().toLowerCase();
    const employeeId = String(req.body?.employeeId || req.query.employeeId || '').trim();
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    const leaveRepo = AppDataSource.getRepository(PayrollLeaveRecord);
    const auditRepo = AppDataSource.getRepository(PayrollLeavePayoutAudit);
    const policy = await getLeavePolicyResolved();
    const staff = await getUnifiedStaffForLeave();
    const records = await leaveRepo.find();

    const rows = staff
      .filter((s) => (!category || category === 'all' || s.staffType === category) && (!employeeId || s.staffId === employeeId))
      .map((s) => {
        const recs = records.filter((r) => r.staffType === s.staffType && r.staffId === s.staffId);
        const accrued = accruedDaysForStaff(s, asOfDate, policy);
        const taken = round2(recs.reduce((sum, r) => sum + Number(r.days || 0), 0));
        let remaining = round2(accrued - taken);
        if (policy.carryForwardCapDays != null && Number.isFinite(policy.carryForwardCapDays)) {
          remaining = Math.min(remaining, Number(policy.carryForwardCapDays));
        }
        const payout = round2(Math.max(remaining, 0) * (s.dailyRate || 0));
        return { s, remaining, payout };
      });

    const saved = await auditRepo.save(
      rows.map((x) =>
        auditRepo.create({
          staffType: x.s.staffType,
          staffId: x.s.staffId,
          employeeNumber: x.s.employeeNumber,
          fullName: x.s.fullName,
          department: x.s.department,
          asOfDate,
          remainingDays: x.remaining,
          dailyRate: x.s.dailyRate || 0,
          payoutAmount: x.payout,
          notes,
          createdBy: req.user?.id || null,
        })
      )
    );
    return res.status(201).json({ message: 'Leave liability audit snapshot saved', count: saved.length });
  } catch (error: any) {
    console.error('createLeaveLiabilityAudit error:', error);
    return res.status(500).json({ message: 'Failed to save liability audit snapshot', error: error?.message || String(error) });
  }
};

export const getLeaveLiabilityAudits = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePayrollTables();
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(PayrollLeavePayoutAudit);
    const category = String(req.query.category || '').trim().toLowerCase();
    const employeeId = String(req.query.employeeId || '').trim();
    const from = toDateOnly(req.query.from);
    const to = toDateOnly(req.query.to);
    const all = await repo.find({ order: { createdAt: 'DESC' } });
    const rows = all.filter((r) => {
      if (category && category !== 'all' && r.staffType !== category) return false;
      if (employeeId && r.staffId !== employeeId) return false;
      const d = toDateOnly(r.asOfDate);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      return true;
    });
    return res.json({ rows });
  } catch (error: any) {
    console.error('getLeaveLiabilityAudits error:', error);
    return res.status(500).json({ message: 'Failed to fetch liability audit history', error: error?.message || String(error) });
  }
};

