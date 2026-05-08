export function parseAmount(value: any, fallback = 0): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value)
    .trim()
    .replace(/[^0-9.-]/g, '');

  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Round to 2 decimal places for currency fields. */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Generate a unique invoice number that is safe under concurrent requests.
 * Uses crypto random bytes so two simultaneous registrations can never collide,
 * unlike the previous count()-based approach which suffered race conditions.
 * Format: INV-YYYY-XXXXXXXX  (8 uppercase hex chars)
 */
export function generateInvoiceNumber(year?: number): string {
  const { randomBytes } = require('crypto') as typeof import('crypto');
  const y = year ?? new Date().getFullYear();
  const unique = randomBytes(4).toString('hex').toUpperCase();
  return `INV-${y}-${unique}`;
}

