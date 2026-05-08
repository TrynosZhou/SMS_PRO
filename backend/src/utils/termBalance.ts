import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';
import { resolveInvoiceRemainingBalance } from './invoiceBalanceResolve';

/**
 * Outstanding balance for the current term invoice only (latest invoice).
 * Uses the same fee-line-aware resolution as Balance Enquiry / PDF so parents are not blocked on stale `balance` columns.
 */
export async function getTermBalanceForStudent(studentId: string): Promise<number> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const latestInvoice = await invoiceRepository.findOne({
    where: { studentId },
    order: { createdAt: 'DESC' },
    relations: ['uniformItems'],
  });
  if (!latestInvoice) {
    return 0;
  }
  return resolveInvoiceRemainingBalance(latestInvoice);
}
