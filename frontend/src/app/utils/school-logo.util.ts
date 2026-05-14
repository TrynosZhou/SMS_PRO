import { environment } from '../../environments/environment';

/**
 * Builds a browser-loadable logo URL. Handles API absolute URLs, `/uploads/...`,
 * Windows paths containing `uploads\`, and `uploads/...` relative paths.
 */
export function resolveSchoolLogoSrc(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return raw;

  const uniform = raw.replace(/\\/g, '/');
  const lower = uniform.toLowerCase();
  const marker = '/uploads/';
  let path = '';
  const idx = lower.indexOf(marker);
  if (idx >= 0) {
    path = uniform.slice(idx).replace(/\/{2,}/g, '/');
  } else if (lower.startsWith('uploads/')) {
    path = `/${uniform}`;
  } else if (uniform.startsWith('/')) {
    path = uniform.replace(/\/{2,}/g, '/');
  } else {
    return raw;
  }

  const base = String(environment.serverBaseUrl || '').replace(/\/$/, '');
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
