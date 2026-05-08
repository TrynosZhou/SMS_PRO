import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { authorize, authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { PaymentAuditLog, PaymentAuditEventType } from '../entities/PaymentAuditLog';
import { parsePaginationParams, buildPaginationResponse } from '../utils/pagination';
import { ensurePaymentAuditLogTable } from '../utils/ensurePaymentAuditLogTable';

export const getPaymentAuditLogs = [
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT),
  async (req: AuthRequest, res: Response) => {
    try {
      await ensurePaymentAuditLogTable();

      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      const repo = AppDataSource.getRepository(PaymentAuditLog);
      const pagination = parsePaginationParams(req.query as any);

      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : '';
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : '';
      const paymentMethod = typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : '';
      const anomalyOnly =
        req.query.anomalyOnly === 'true' ||
        req.query.anomalyOnly === '1' ||
        req.query.anomaly === 'true' ||
        req.query.anomaly === '1';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

      const sortByRaw = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'eventAt';
      const sortDirRaw = typeof req.query.sortDir === 'string' ? req.query.sortDir : 'DESC';
      const sortDir = sortDirRaw.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const allowedSorts: Record<string, string> = {
        eventAt: 'log.eventAt',
        updatedAt: 'log.eventAt',
        username: 'log.username',
        studentId: 'log.studentId',
        studentNumber: 'log.studentNumber',
        lastName: 'log.lastName',
        firstName: 'log.firstName',
        amountPaid: 'log.amountPaid',
        paymentMethod: 'log.paymentMethod',
        referenceNumber: 'log.referenceNumber',
        anomaly: 'log.anomaly'
      };

      const sortBy = allowedSorts[sortByRaw] || 'log.eventAt';

      const qb = repo.createQueryBuilder('log');

      if (startDate) {
        qb.andWhere('log.eventAt >= :startDate', { startDate: new Date(startDate) });
      }
      if (endDate) {
        // include end date fully
        const d = new Date(endDate);
        d.setHours(23, 59, 59, 999);
        qb.andWhere('log.eventAt <= :endDate', { endDate: d });
      }
      if (paymentMethod) {
        qb.andWhere('LOWER(log.paymentMethod) = :pm', { pm: paymentMethod.toLowerCase() });
      }
      if (anomalyOnly) {
        qb.andWhere('log.anomaly = true');
      }
      if (search) {
        // search by student uuid (id) or student number or names
        qb.andWhere(
          `(
            log.studentId::text ILIKE :q OR
            log.studentNumber ILIKE :q OR
            LOWER(log.firstName) ILIKE :q OR
            LOWER(log.lastName) ILIKE :q OR
            LOWER(log.username) ILIKE :q OR
            log.referenceNumber ILIKE :q
          )`,
          { q: `%${search}%` }
        );
      }

      qb.orderBy(sortBy, sortDir);

      const total = await qb.getCount();
      const data = await qb.skip(pagination.skip).take(pagination.limit).getMany();

      return res.json(buildPaginationResponse(data, pagination.page, pagination.limit, total));
    } catch (err: any) {
      console.error('getPaymentAuditLogs error:', err);
      return res.status(500).json({
        message: 'Failed to fetch payment audit logs',
        error: err?.message || err
      });
    }
  }
];

