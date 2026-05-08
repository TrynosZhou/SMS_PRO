/** Matches backend `formatTeacherTitleName` — class timetable PDF & preview cells. */
export function formatClassTimetableTeacherLabel(
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

/**
 * Timetable preview header / PDF subtitle: title + full first and last name (matches backend `formatTeacherTimetableHeaderLabel`).
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
