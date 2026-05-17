import * as path from 'path';
import * as fs from 'fs';
import sizeOf from 'image-size';
import PDFDocument from 'pdfkit';
import { canonicalSchoolLogoStorageValue } from './schoolLogoUrl';

/** Project-root-relative path (matches server static /uploads). */
function resolveProjectRootFile(relativePath: string): string {
  const normalized = relativePath.replace(/^\//, '');
  return path.join(__dirname, '../../..', normalized);
}

/**
 * Load school logo bytes from Settings (Logo URL field on System Settings).
 * Supports base64 data URLs and stored paths such as /uploads/logos/...
 */
export function loadSchoolLogoBuffer(logo?: string | null): Buffer | null {
  if (!logo) return null;
  const trimmed = String(logo).trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('data:image')) {
      const idx = trimmed.indexOf('base64,');
      const base64Data = idx >= 0 ? trimmed.slice(idx + 7) : trimmed.split(',')[1];
      return base64Data ? Buffer.from(base64Data, 'base64') : null;
    }

    const canonical = canonicalSchoolLogoStorageValue(trimmed);
    if (!canonical) return null;
    if (canonical.startsWith('data:image')) {
      return loadSchoolLogoBuffer(canonical);
    }

    let relative = canonical;
    if (/^https?:\/\//i.test(relative)) {
      try {
        const u = new URL(relative);
        const marker = '/uploads/';
        const idx = u.pathname.toLowerCase().indexOf(marker);
        if (idx >= 0) {
          relative = u.pathname.slice(idx);
        } else {
          return null;
        }
      } catch {
        return null;
      }
    }

    const normalizedPath = relative.replace(/^\//, '');
    const candidates = [
      resolveProjectRootFile(normalizedPath),
      path.join(__dirname, '../../', normalizedPath),
    ];
    for (const absolutePath of candidates) {
      if (fs.existsSync(absolutePath)) {
        return fs.readFileSync(absolutePath);
      }
    }
  } catch (e) {
    console.error('loadSchoolLogoBuffer:', e);
  }
  return null;
}

/** Draw logo inside a box preserving aspect ratio (contain). Returns true if drawn. */
export function drawSchoolLogoInBox(
  doc: InstanceType<typeof PDFDocument>,
  imageBuffer: Buffer,
  startX: number,
  startY: number,
  boxWidth: number,
  boxHeight: number
): boolean {
  try {
    const dimensions = sizeOf(imageBuffer);
    const imgWidth = dimensions.width || boxWidth;
    const imgHeight = dimensions.height || boxHeight;
    const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);
    const finalWidth = imgWidth * scale;
    const finalHeight = imgHeight * scale;
    const centeredX = startX + (boxWidth - finalWidth) / 2;
    const centeredY = startY + (boxHeight - finalHeight) / 2;
    doc.image(imageBuffer, centeredX, centeredY, { width: finalWidth, height: finalHeight });
    return true;
  } catch (e) {
    console.error('drawSchoolLogoInBox:', e);
    return false;
  }
}

/** Prefer primary logo from System Settings, then secondary. */
export function loadPrimarySchoolLogoBuffer(settings: {
  schoolLogo?: string | null;
  schoolLogo2?: string | null;
} | null): Buffer | null {
  if (!settings) return null;
  return loadSchoolLogoBuffer(settings.schoolLogo) || loadSchoolLogoBuffer(settings.schoolLogo2);
}
