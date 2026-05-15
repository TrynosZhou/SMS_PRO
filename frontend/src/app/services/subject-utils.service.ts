import { Injectable } from '@angular/core';

export type SubjectCategory = 'O_LEVEL' | 'A_LEVEL';
export type ClassLevelBand = 'O_LEVEL' | 'A_LEVEL' | 'UNKNOWN';

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

  /** Infer O vs A level from class form/name (mirrors backend fee band logic). */
  inferClassLevelBand(classEntity: { form?: string | null; name?: string | null } | null | undefined): ClassLevelBand {
    if (!classEntity) return 'O_LEVEL';
    const raw = `${classEntity.form || ''} ${classEntity.name || ''}`.trim();
    if (!raw) return 'UNKNOWN';
    const low = raw.toLowerCase();
    if (/\b(lower|upper)\s*6\b|\bform\s*[5-6]\b|\bl6\b|\bu6\b|\bsixth\s*form\b/i.test(low)) {
      return 'A_LEVEL';
    }
    if (/\bform\s*[1-4]\b/i.test(low)) return 'O_LEVEL';
    const formNum = low.match(/\bform\s*(\d+)\b/i)?.[1];
    if (formNum) {
      const n = parseInt(formNum, 10);
      if (n >= 5) return 'A_LEVEL';
      if (n >= 1 && n <= 4) return 'O_LEVEL';
    }
    return 'UNKNOWN';
  }

  subjectMatchesClassLevelBand(category: string | null | undefined, band: ClassLevelBand): boolean {
    const cat = this.normalizeCategory(category);
    if (band === 'A_LEVEL') return cat === 'A_LEVEL';
    if (band === 'O_LEVEL') return cat === 'O_LEVEL';
    return cat === 'O_LEVEL';
  }
}
