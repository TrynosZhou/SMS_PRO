/**
 * Rebuild a student's opening invoice from the current Finance → Manage → Fees catalog.
 *
 * Usage:
 *   npx ts-node scripts/rebuild-student-opening-invoice.ts --student-number VIC9132026
 *   npx ts-node scripts/rebuild-student-opening-invoice.ts --student-id <uuid>
 *   npx ts-node scripts/rebuild-student-opening-invoice.ts --invoice-id <uuid>
 *
 * Requires DATABASE_URL / same .env as the backend.
 */

import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { rebuildOpeningInvoiceForStudent } from '../src/utils/openingInvoiceCompute';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1].trim() || undefined;
}

async function main() {
  const studentNumber = arg('--student-number');
  const studentId = arg('--student-id');
  const invoiceId = arg('--invoice-id');

  if (!studentNumber && !studentId && !invoiceId) {
    console.error(
      'Usage: npx ts-node scripts/rebuild-student-opening-invoice.ts --student-number VIC9132026\n' +
        '   or: --student-id <uuid>  or  --invoice-id <uuid>'
    );
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    const result = await rebuildOpeningInvoiceForStudent(AppDataSource, {
      studentNumber,
      studentId,
      invoiceId,
    });
    if (!result.ok) {
      console.error('Failed:', result.reason);
      process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
