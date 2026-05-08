/**
 * Utility functions to filter data for demo users
 * Demo users should only see data created by demo users (isDemo = true)
 */

import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';

/**
 * Check if the current user is a demo user
 */
export function isDemoUser(req: AuthRequest): boolean {
  const isDemo = req.user?.isDemo === true || 
                 req.user?.role === UserRole.DEMO_USER ||
                 req.user?.email === 'demo@school.com' || 
                 req.user?.username === 'demo@school.com';
  if (isDemo && !req.user?.isDemo && req.user?.role !== UserRole.DEMO_USER) {
    // Log if we detect demo account but isDemo flag is not set
    console.warn('⚠️ Demo account detected but isDemo flag is not set. Email:', req.user?.email, 'Username:', req.user?.username);
  }
  return isDemo;
}

/**
 * Get filter condition for demo users
 * Returns a condition object that filters to only show demo data
 */
export function getDemoDataFilter(req: AuthRequest): any {
  if (isDemoUser(req)) {
    // For demo users, only show data from demo users
    return { user: { isDemo: true } };
  }
  // For non-demo users, no filter (show all data)
  return {};
}

/**
 * Filter array of items to only include demo data if user is demo
 */
export function filterDemoData<T extends { user?: { isDemo?: boolean } }>(
  items: T[],
  req: AuthRequest
): T[] {
  if (isDemoUser(req)) {
    return items.filter(item => item.user?.isDemo === true);
  }
  return items;
}

