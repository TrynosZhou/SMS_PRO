import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { ClassService } from '../../../services/class.service';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-results-analysis',
  templateUrl: './results-analysis.component.html',
  styleUrls: ['./results-analysis.component.css']
})
export class ResultsAnalysisComponent implements OnInit {
  classes: any[] = [];
  subjects: any[] = [];
  selectedClass = '';
  selectedExamType = '';
  selectedTerm = '';
  selectedSubjectId = '';

  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];

  availableTerms: string[] = [];
  loading = false;
  error = '';
  query = '';
  sortKey: 'subject' | 'subjectCode' | 'passRate' | 'passed' | 'totalStudents' | 'withMarks' = 'passRate';
  sortDir: 'asc' | 'desc' = 'desc';

  results: Array<{
    subject: string;
    subjectCode?: string;
    passRate: number;
    passed: number;
    totalStudents: number;
    withMarks: number;
  }> = [];

  subjectLoading = false;
  subjectError = '';
  subjectAnalysis: any = null;

  get filteredResults() {
    const q = (this.query || '').trim().toLowerCase();
    const base = !q
      ? [...this.results]
      : this.results.filter((r) => {
          const hay = `${r.subject || ''} ${r.subjectCode || ''}`.toLowerCase();
          return hay.includes(q);
        });

    const dir = this.sortDir === 'asc' ? 1 : -1;
    const key = this.sortKey;
    base.sort((a: any, b: any) => {
      const av = a?.[key];
      const bv = b?.[key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' }) * dir;
    });

    return base;
  }

  constructor(
    private authService: AuthService,
    private classService: ClassService,
    private examService: ExamService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    if (!this.canAccess()) {
      this.error = 'Access denied. Teacher or administrator access required.';
      return;
    }
    this.loadClasses();
    this.loadTermOptions();
  }

  canAccess(): boolean {
    return (
      this.authService.hasRole('teacher') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin')
    );
  }

  loadClasses(): void {
    this.classService.getClasses({ limit: 500 }).subscribe({
      next: (res: any) => {
        // Backend returns either an array OR a paginated object { data, page, limit, total, totalPages }.
        const list = res?.data || res?.classes || res || [];
        this.classes = this.classService.sortClasses(Array.isArray(list) ? list : []);
      },
      error: () => {
        this.classes = [];
      }
    });
  }

  loadTermOptions(): void {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    this.availableTerms = [
      `Term 1 ${currentYear}`,
      `Term 2 ${currentYear}`,
      `Term 3 ${currentYear}`,
      `Term 1 ${nextYear}`,
      `Term 2 ${nextYear}`,
      `Term 3 ${nextYear}`
    ];

    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        const activeTerm = data?.activeTerm || data?.currentTerm;
        if (activeTerm) {
          if (!this.availableTerms.includes(activeTerm)) {
            this.availableTerms.unshift(activeTerm);
          }
          this.selectedTerm = activeTerm;
        } else if (!this.selectedTerm && this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
      },
      error: () => {
        if (!this.selectedTerm && this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
      }
    });
  }

  getAnalysis(): void {
    this.error = '';
    this.results = [];
    this.query = '';
    this.subjectAnalysis = null;
    this.subjectError = '';

    if (!this.selectedClass || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Class, term, and exam type are required.';
      return;
    }

    this.loading = true;
    this.examService.getResultsAnalysis(this.selectedClass, this.selectedExamType, this.selectedTerm).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.results = res?.results || [];
        this.loadSubjectsForClass();
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || err?.message || 'Failed to fetch analysis.';
      }
    });
  }

  loadSubjectsForClass(): void {
    this.subjects = [];
    this.selectedSubjectId = '';
    this.subjectAnalysis = null;
    this.subjectError = '';

    if (!this.selectedClass) return;

    const existing = this.classes.find((c: any) => c.id === this.selectedClass);
    if (existing?.subjects && Array.isArray(existing.subjects) && existing.subjects.length > 0) {
      this.subjects = [...existing.subjects];
      this.subjects.sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
      return;
    }

    this.classService.getClassById(this.selectedClass).subscribe({
      next: (data: any) => {
        const subs = data?.subjects || [];
        this.subjects = Array.isArray(subs) ? [...subs] : [];
        this.subjects.sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
      },
      error: () => {
        this.subjects = [];
      }
    });
  }

  fetchSubjectAnalysis(): void {
    this.subjectError = '';
    this.subjectAnalysis = null;
    if (!this.selectedClass || !this.selectedExamType || !this.selectedTerm || !this.selectedSubjectId) {
      this.subjectError = 'Select class, term, exam type, and subject.';
      return;
    }

    this.subjectLoading = true;
    this.examService
      .getResultsAnalysisForSubject(this.selectedClass, this.selectedExamType, this.selectedTerm, this.selectedSubjectId)
      .subscribe({
        next: (res: any) => {
          this.subjectLoading = false;
          this.subjectAnalysis = res || null;
        },
        error: (err: any) => {
          this.subjectLoading = false;
          this.subjectError = err?.error?.message || err?.message || 'Failed to fetch subject analysis.';
        }
      });
  }

  setSort(key: typeof this.sortKey): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDir = key === 'subject' || key === 'subjectCode' ? 'asc' : 'desc';
  }

  sortAria(key: typeof this.sortKey): string {
    if (this.sortKey !== key) return 'none';
    return this.sortDir === 'asc' ? 'ascending' : 'descending';
  }

  passRateTone(rate: number): 'good' | 'warn' | 'bad' {
    const r = Number(rate);
    if (!Number.isFinite(r)) return 'bad';
    if (r >= 70) return 'good';
    if (r >= 40) return 'warn';
    return 'bad';
  }

  trackBySubject(_: number, r: any): string {
    return String(r?.subjectCode || r?.subject || _);
  }
}

