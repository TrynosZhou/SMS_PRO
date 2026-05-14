import type { Request } from 'express';

/**
 * Turn stored school logo values into a web path under `/uploads/...`.
 * Accepts: absolute Windows paths containing `uploads\`, relative `uploads/...`, or `/uploads/...`.
 * Leaves http(s) and data URLs unchanged.
 */
export function canonicalSchoolLogoStorageValue(input: string | null | undefined): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:')) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const lowerPath = u.pathname.toLowerCase();
      const marker = '/uploads/';
      const idx = lowerPath.indexOf(marker);
      if (idx >= 0) {
        const tail = u.pathname.slice(idx).replace(/\/{2,}/g, '/');
        return tail.startsWith('/') ? tail : `/${tail}`;
      }
    } catch {
      /* keep full URL */
    }
    return raw;
  }

  const uniform = raw.replace(/\\/g, '/');
  const lower = uniform.toLowerCase();
  const marker = '/uploads/';
  const idx = lower.indexOf(marker);
  if (idx >= 0) {
    const tail = uniform.slice(idx).replace(/\/{2,}/g, '/');
    return tail.startsWith('/') ? tail : `/${tail}`;
  }
  if (lower.startsWith('uploads/')) {
    return `/${uniform}`;
  }
  return raw;
}

/**
 * URL suitable for `<img src>` in the browser (absolute when path is relative).
 */
export function absoluteSchoolLogoClientUrl(
  input: string | null | undefined,
  req: Pick<Request, 'get' | 'protocol'>
): string | null {
  const c = canonicalSchoolLogoStorageValue(input);
  if (!c) return null;
  if (/^https?:\/\//i.test(c) || c.startsWith('data:')) return c;

  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const pathPart = c.startsWith('/') ? c : `/${c}`;
  return `${proto}://${host}${pathPart}`;
}
