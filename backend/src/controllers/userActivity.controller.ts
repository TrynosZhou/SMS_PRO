import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { UserActivityLog } from '../entities/UserActivityLog';
import { AuthRequest, authorize, authenticate } from '../middleware/auth';
import { IsNull } from 'typeorm';
import { UserRole } from '../entities/User';
import { ensureUserActivityLogTable } from '../utils/ensureUserActivityLogTable';

export const logMenuAccess = [
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT),
  async (req: AuthRequest, res: Response) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const menu = (req.body?.menu || req.body?.menuAccessed || req.body?.path || '').toString().trim();
    if (!menu) {
      return res.status(400).json({ message: 'menu is required' });
    }

    const handle = async () => {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      const repo = AppDataSource.getRepository(UserActivityLog);

      // Update the latest active session for this user
      const activeLog = await repo.findOne({
        where: { userId: user.id, logoutAt: IsNull() },
        order: { loginAt: 'DESC' }
      });

      // If login activity was not recorded yet for some reason, create an entry now.
      const log = activeLog
        ? activeLog
        : repo.create({
            userId: user.id,
            username: user.username,
            role: user.role,
            loginAt: new Date(),
            logoutAt: null,
            menusAccessed: null,
            lastMenuAccessed: null
          });

      const last = log.lastMenuAccessed || '';
      if (last !== menu) {
        const existing = (log.menusAccessed || '').trim();
        log.menusAccessed = existing ? `${existing}\n${menu}` : menu;
        log.lastMenuAccessed = menu;
      }

      await repo.save(log);
      return res.json({ message: 'Menu access logged' });
    };

    try {
      await handle();
    } catch (err: any) {
      // If migrations haven't been run yet, create the table on-demand then retry once.
      if (err?.code === '42P01') {
        await ensureUserActivityLogTable();
        return handle();
      }
      console.error('logMenuAccess error:', err);
      return res.status(500).json({ message: 'Failed to log menu access', error: err?.message || err });
    }
  }
];

export const getUserActivityLogs = [
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT),
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureUserActivityLogTable();

      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      const repo = AppDataSource.getRepository(UserActivityLog);

      const logs = await repo.find({
        order: { loginAt: 'DESC' }
      });

      return res.json({
        logs: logs.map((l) => ({
          id: l.id,
          username: l.username,
          role: l.role,
          loginAt: l.loginAt,
          logoutAt: l.logoutAt,
          menusAccessed: l.menusAccessed || ''
        }))
      });
    } catch (err: any) {
      console.error('getUserActivityLogs error:', err);
      return res.status(500).json({ message: 'Failed to fetch user activity logs', error: err?.message || err });
    }
  }
];

