import { Injectable } from '@angular/core';

export type SubjectCategory = 'O_LEVEL' | 'A_LEVEL';

@Injectable({
  providedIn: 'root'
})
export class SubjectUtilsService {
  
  /**
   * Display label for a subject category (API stores O_LEVEL | A_LEVEL).
   */
  getCategoryLabel(category: SubjectCategory | string | null | undefined): string {
    if (!category) return 'O Level';
    const c = String(category).toUpperCase();
    if (c === 'A_LEVEL' || c === 'AS_A_LEVEL') return 'A Level';
    return 'O Level';
  }

  /**
   * Options for syllabus category selectors (manage subject / create & edit).
   */
  getCategories(): Array<{ value: SubjectCategory; label: string }> {
    return [
      { value: 'O_LEVEL', label: 'O Level' },
      { value: 'A_LEVEL', label: 'A Level' }
    ];
  }

  /**
   * Normalize free text or legacy values to API category.
   */
  normalizeCategory(category: string | null | undefined): SubjectCategory {
    if (!category) return 'O_LEVEL';
    const upper = category.toUpperCase().replace(/[\s-]+/g, '_');
    if (
      upper === 'AS_A_LEVEL' ||
      upper === 'A_LEVEL' ||
      upper === 'ALEVEL'
    ) {
      return 'A_LEVEL';
    }
    if (upper === 'IGCSE' || upper === 'O_LEVEL' || upper === 'OLEVEL') {
      return 'O_LEVEL';
    }
    return 'O_LEVEL';
  }
}
