import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';

export interface AuthRequest extends Request {
  user?: User;
  /** JWT `studentRecordId` — students.id for the account that just logged in (avoids wrong User.student join). */
  authStudentRecordId?: string;
  file?: Express.Multer.File;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, jwtSecret) as {
      userId: string;
      role?: string;
      studentRecordId?: string;
    };
    const userRepository = AppDataSource.getRepository(User);
    let user: User | null = null;
    try {
      user = await userRepository.findOne({
        where: { id: decoded.userId },
        relations: ['student', 'teacher', 'parent'],
      });
    } catch (dbErr: any) {
      // If DB schema is behind (e.g., missing teachers.role), avoid taking auth down.
      const code = dbErr?.code || dbErr?.driverError?.code;
      if (code === '42703') {
        user = await userRepository.findOne({
          where: { id: decoded.userId },
          relations: ['student', 'parent'],
        });
      } else {
        throw dbErr;
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or inactive user' });
    }

    req.user = user;
    req.authStudentRecordId =
      typeof decoded.studentRecordId === 'string' && decoded.studentRecordId.trim()
        ? decoded.studentRecordId.trim()
        : undefined;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    console.error('Auth error:', error);
    return res.status(500).json({ message: 'Authentication error', error: error.message });
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.some(role => String(role).toLowerCase() === String(req.user?.role).toLowerCase())) {
      console.log('Authorization failed:', {
        userRole: req.user?.role,
        requiredRoles: roles,
        path: req.path,
        method: req.method
      });
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

