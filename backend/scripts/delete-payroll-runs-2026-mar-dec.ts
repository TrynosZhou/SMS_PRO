/**
 * One-time cleanup: delete payroll runs for March–December 2026 (DB rows + payslip PDF folders).
 *
 * Usage (from backend folder):
 *   npx ts-node scripts/delete-payroll-runs-2026-mar-dec.ts
 *   npm run delete-payroll-runs-2026-mar-dec
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { In } from 'typeorm';
import { AppDataSource } from '../src/config/database';
import { PayrollRun } from '../src/entities/PayrollRun';
import { PayrollRunLine } from '../src/entities/PayrollRunLine';
import { PayrollPayslip } from '../src/entities/PayrollPayslip';

dotenv.config();

const TARGET_YEAR = 2026;
const MONTH_FROM = 3;
const MONTH_TO = 12;

function uploadsPayrollsBase(): string {
  return path.join(__dirname, '../uploads/payrolls');
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const runRepo = AppDataSource.getRepository(PayrollRun);
  const lineRepo = AppDataSource.getRepository(PayrollRunLine);
  const payslipRepo = AppDataSource.getRepository(PayrollPayslip);

  const runs = await runRepo
    .createQueryBuilder('r')
    .where('r.runYear = :y', { y: TARGET_YEAR })
    .andWhere('r.runMonth BETWEEN :m1 AND :m2', { m1: MONTH_FROM, m2: MONTH_TO })
    .getMany();

  if (runs.length === 0) {
    console.log('No payroll runs found for 2026-03 .. 2026-12. Nothing to delete.');
    await AppDataSource.destroy();
    return;
  }

  let deletedRuns = 0;
  for (const run of runs) {
    const lines = await lineRepo.find({ where: { payrollRunId: run.id } });
    const lineIds = lines.map((l) => l.id);
    if (lineIds.length > 0) {
      await payslipRepo.delete({ payrollRunLineId: In(lineIds) });
    }
    await lineRepo.delete({ payrollRunId: run.id });
    await runRepo.delete({ id: run.id });

    const periodDir = path.join(uploadsPayrollsBase(), run.periodLabel);
    if (fs.existsSync(periodDir)) {
      fs.rmSync(periodDir, { recursive: true, force: true });
      console.log('Removed folder:', periodDir);
    }

    deletedRuns += 1;
    console.log(`Deleted run ${run.periodLabel} (${run.id})`);
  }

  console.log(`Done. Removed ${deletedRuns} payroll run(s).`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
