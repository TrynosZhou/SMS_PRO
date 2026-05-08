/**
 * Formal label: title + last name + first initial (class timetables, PDFs, teacher dashboard greeting).
 * - Male: Mr {lastName} {initial}
 * - Female married: Mrs {lastName} {initial}
 * - Female single: Miss {lastName} {initial}
 * - Female divorced or widowed, or unset / legacy `ms`: Ms {lastName} {initial}
 */
export function formatTeacherTitleName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  gender: string | null | undefined,
  maritalStatus: string | null | undefined = undefined
): string {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  const g = (gender || '').trim().toLowerCase();
  const initial = fn ? fn.charAt(0).toUpperCase() : '';
  const nameTail = ln ? (initial ? `${ln} ${initial}` : ln) : initial || '';

  const isMale = g === 'male' || g === 'm' || g.startsWith('male');
  const isFemale = g === 'female' || g === 'f' || g.startsWith('female');

  if (isMale && nameTail) {
    return `Mr ${nameTail}`.trim();
  }

  if (isFemale && nameTail) {
    const m = (maritalStatus || '').trim().toLowerCase();
    let title = 'Ms';
    if (m === 'married') {
      title = 'Mrs';
    } else if (m === 'single') {
      title = 'Miss';
    } else if (m === 'ms') {
      title = 'Ms';
    } else if (m === 'divorced' || m === 'widowed') {
      title = 'Ms';
    } else if (!m) {
      title = 'Ms';
    }
    return `${title} ${nameTail}`.trim();
  }

  return [fn, ln].filter(Boolean).join(' ').trim() || 'Teacher';
}

/** Alias for class timetable / PDF cells (same rules). */
export const formatClassTimetableTeacherLabel = formatTeacherTitleName;

/**
 * Timetable sheet header / subtitle: title + full first and last name (preview "Teacher:" line and teacher PDF header).
 * Male → Mr; female married → Mrs; single → Miss; divorced / widowed / unset → Ms.
 */
export function formatTeacherTimetableHeaderLabel(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  gender: string | null | undefined,
  maritalStatus: string | null | undefined = undefined
): string {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  const full = [fn, ln].filter(Boolean).join(' ');
  if (!full) {
    return 'Teacher';
  }

  const g = (gender || '').trim().toLowerCase();
  const isMale = g === 'male' || g === 'm' || g.startsWith('male');
  const isFemale = g === 'female' || g === 'f' || g.startsWith('female');

  if (isMale) {
    return `Mr ${full}`;
  }

  if (isFemale) {
    const m = (maritalStatus || '').trim().toLowerCase();
    let title = 'Ms';
    if (m === 'married') {
      title = 'Mrs';
    } else if (m === 'single') {
      title = 'Miss';
    } else if (m === 'ms') {
      title = 'Ms';
    } else if (m === 'divorced' || m === 'widowed') {
      title = 'Ms';
    } else if (!m) {
      title = 'Ms';
    }
    return `${title} ${full}`;
  }

  return full;
}
