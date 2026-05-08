/**
 * Persist marital status only when it matches gender:
 * - Female: married, single, divorced, widowed
 * - Male: married, single, divorced, widower
 */
export function normalizeTeacherMaritalStatus(
  gender: string | null | undefined,
  maritalStatus: unknown
): string | null {
  const g = (gender || '').trim().toLowerCase();
  const isFemale = g.startsWith('female');
  const isMale = g.startsWith('male');
  if (!isFemale && !isMale) {
    return null;
  }
  const raw =
    maritalStatus !== undefined && maritalStatus !== null && String(maritalStatus).trim() !== ''
      ? String(maritalStatus).trim().toLowerCase()
      : '';
  if (!raw) {
    return null;
  }
  if (isFemale && ['married', 'single', 'divorced', 'widowed'].includes(raw)) {
    return raw;
  }
  if (isMale && ['married', 'single', 'divorced', 'widower'].includes(raw)) {
    return raw;
  }
  return null;
}
