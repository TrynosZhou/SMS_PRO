import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-mark-input-progress',
  templateUrl: './mark-input-progress.component.html',
  styleUrls: ['./mark-input-progress.component.css']
})
export class MarkInputProgressComponent implements OnInit {
  /** Select this value to load progress for every class. */
  readonly ALL_CLASSES_VALUE = '__ALL__';

  classes: any[] = [];
  terms: Array<{ label: string; status?: string; termNumber?: number | string; year?: number | string; id?: string }> = [];
  selectedClassId = '';
  selectedTerm = '';
  selectedExamType: 'mid_term' | 'end_term' | '' = '';

  progressData: any = null;
  loading = false;
  loadingTerms = false;
  loadingClasses = false;
  error = '';

  viewMode: 'cards' | 'table' = 'cards';
  subjectSearch = '';
  autoLoadProgress = false;
  lastLoadedAt: number | null = null;
  statusFilter: 'all' | 'not-started' | 'started' | 'progress' | 'almost' | 'completed' = 'all';
  sortKey: 'subjectCode' | 'subjectName' | 'studentsWithMarks' | 'completion' = 'completion';
  sortDir: 'asc' | 'desc' = 'desc';

  readonly allowedExamTypeValues = ['mid_term', 'end_term'] as const;

  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.loadTerms();
    this.loadSettings();
    this.loadClasses();
  }

  loadTerms() {
    this.loadingTerms = true;
    this.settingsService.getTerms().subscribe({
      next: (data: any) => {
        const raw: any[] = Array.isArray(data) ? data : data?.terms || [];
        this.terms = raw.map((t: any) => ({
          ...t,
          label: `Term ${t.termNumber} ${t.year}`
        }));
        this.loadingTerms = false;
        if (!this.selectedTerm) {
          const active = this.terms.find((t: any) => t.status === 'active');
          if (active) this.selectedTerm = active.label;
        }
      },
      error: () => {
        this.terms = [];
        this.loadingTerms = false;
      }
    });
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings && !this.selectedTerm) {
          this.selectedTerm = settings.activeTerm || settings.currentTerm || '';
        }
      },
      error: (error) => console.error('Error loading settings:', error)
    });
  }

  loadClasses() {
    this.loadingClasses = true;
    this.classService.getClasses().subscribe(
      (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        const activeClasses = classesList.filter((c: any) => c.isActive);
        this.classes = this.classService.sortClasses(activeClasses);
        this.loadingClasses = false;
      },
      (error: any) => {
        console.error('Error loading classes:', error);
        this.error = 'Failed to load classes';
        this.loadingClasses = false;
      }
    );
  }

  get canLoad(): boolean {
    return !!this.selectedTerm && !!this.selectedExamType && !!this.selectedClassId;
  }

  getSelectedClassName(): string {
    if (!this.selectedClassId) return '';
    if (this.selectedClassId === this.ALL_CLASSES_VALUE) return 'All classes';
    return this.classes.find((c) => c.id === this.selectedClassId)?.name || '';
  }

  formatExamTypeLabel(type: string): string {
    if (type === 'mid_term') return 'MidTerm';
    if (type === 'end_term') return 'EndOfTerm';
    return type || '';
  }

  get isAllClassesView(): boolean {
    return this.progressData?.mode === 'all' && Array.isArray(this.progressData?.classes);
  }

  loadProgress() {
    if (!this.canLoad) {
      this.error = 'Please choose Term, Exam Type, and Class.';
      setTimeout(() => (this.error = ''), 4000);
      return;
    }
    this.loading = true;
    this.error = '';
    this.progressData = null;

    const term = this.selectedTerm || undefined;
    const examType = (this.selectedExamType || undefined) as 'mid_term' | 'end_term' | undefined;

    const req =
      this.selectedClassId === this.ALL_CLASSES_VALUE
        ? this.examService.getMarkInputProgressAllClassesSubjects(term, examType)
        : this.examService.getMarkInputProgressByClassSubjects(this.selectedClassId, term, examType);

    req.subscribe({
      next: (data: any) => {
        this.progressData = data;
        this.lastLoadedAt = Date.now();
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading progress:', error);
        this.error = error.error?.message || 'Failed to load progress data';
        this.loading = false;
      }
    });
  }

  private normalizePct(v: any): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, n));
  }

  private statusKeyFromPercentage(pct: number): 'not-started' | 'started' | 'progress' | 'almost' | 'completed' {
    if (!Number.isFinite(pct) || pct <= 0) return 'not-started';
    if (pct >= 80) return 'completed';
    if (pct >= 50) return 'almost';
    if (pct >= 25) return 'progress';
    return 'started';
  }

  private applySubjectFilterSort(subjects: any[]): any[] {
    const statusFilter = this.statusFilter;
    const sortKey = this.sortKey;
    const sortDir = this.sortDir;
    const dir = sortDir === 'asc' ? 1 : -1;
    const q = this.subjectSearch.trim().toLowerCase();

    const filtered = subjects.filter((s: any) => {
      const pct = this.normalizePct(s?.completionPercentage);
      const statusOk = statusFilter === 'all' || this.statusKeyFromPercentage(pct) === statusFilter;
      if (!statusOk) return false;
      if (!q) return true;
      const code = String(s?.subjectCode || '').toLowerCase();
      const name = String(s?.subjectName || '').toLowerCase();
      return code.includes(q) || name.includes(q);
    });

    return [...filtered].sort((a: any, b: any) => {
      const av = a ?? {};
      const bv = b ?? {};
      const aCode = String(av.subjectCode ?? '');
      const bCode = String(bv.subjectCode ?? '');
      const aName = String(av.subjectName ?? '');
      const bName = String(bv.subjectName ?? '');
      const aWith = Number(av.studentsWithMarks || 0);
      const bWith = Number(bv.studentsWithMarks || 0);
      const aPct = this.normalizePct(av.completionPercentage);
      const bPct = this.normalizePct(bv.completionPercentage);

      let cmp = 0;
      switch (sortKey) {
        case 'subjectCode':
          cmp = aCode.localeCompare(bCode);
          break;
        case 'subjectName':
          cmp = aName.localeCompare(bName);
          break;
        case 'studentsWithMarks':
          cmp = aWith - bWith;
          break;
        case 'completion':
        default:
          cmp = aPct - bPct;
          break;
      }
      return cmp * dir;
    });
  }

  get filteredSortedSubjects(): any[] {
    if (this.isAllClassesView) return [];
    const subjects = Array.isArray(this.progressData?.subjects) ? this.progressData.subjects : [];
    return this.applySubjectFilterSort(subjects);
  }

  /** Per-class blocks with filtered/sorted subjects (All classes mode). */
  get filteredSortedClasses(): any[] {
    if (!this.isAllClassesView) return [];
    const list = this.progressData.classes as any[];
    return list
      .map((block) => ({
        ...block,
        subjects: this.applySubjectFilterSort(block.subjects || [])
      }))
      .filter((block) => block.subjects.length > 0);
  }

  get hasExportableRows(): boolean {
    if (this.isAllClassesView) {
      return this.filteredSortedClasses.some((b) => (b.subjects || []).length > 0);
    }
    return this.filteredSortedSubjects.length > 0;
  }

  get overallStats(): {
    totalStudents: number;
    totalSubjects: number;
    avgCompletion: number;
    onTrack: number;
    classCount?: number;
  } {
    if (this.isAllClassesView) {
      const blocks = this.filteredSortedClasses;
      let sumPct = 0;
      let n = 0;
      let onTrack = 0;
      let totalStudentsSum = 0;
      for (const b of blocks) {
        totalStudentsSum += Number(b.totalStudents || 0);
        for (const s of b.subjects) {
          n++;
          const p = this.normalizePct(s.completionPercentage);
          sumPct += p;
          if (p >= 80) onTrack++;
        }
      }
      return {
        totalStudents: totalStudentsSum,
        totalSubjects: n,
        avgCompletion: n ? Math.round((sumPct / n) * 10) / 10 : 0,
        onTrack,
        classCount: blocks.length
      };
    }

    const totalStudents = Number(this.progressData?.totalStudents || 0);
    const subjects = this.filteredSortedSubjects;
    const totalSubjects = subjects.length;
    const avgCompletion =
      totalSubjects > 0
        ? Math.round(
            (subjects.reduce((sum: number, s: any) => sum + this.normalizePct(s?.completionPercentage), 0) /
              totalSubjects) *
              10
          ) / 10
        : 0;
    const onTrack = subjects.filter((s: any) => this.normalizePct(s?.completionPercentage) >= 80).length;
    return { totalStudents, totalSubjects, avgCompletion, onTrack };
  }

  setStatusFilter(v: MarkInputProgressComponent['statusFilter']) {
    this.statusFilter = v;
  }

  toggleSort(key: MarkInputProgressComponent['sortKey']) {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortKey = key;
    this.sortDir = key === 'subjectName' || key === 'subjectCode' ? 'asc' : 'desc';
  }

  sortAria(key: MarkInputProgressComponent['sortKey']): string {
    if (this.sortKey !== key) return 'Sort';
    return this.sortDir === 'asc' ? 'Sorted ascending' : 'Sorted descending';
  }

  exportCSV() {
    if (this.isAllClassesView) {
      const blocks = this.filteredSortedClasses;
      const rows: any[] = [];
      for (const block of blocks) {
        const className = String(block.class?.name || '');
        const totalStudents = Number(block.totalStudents || 0);
        for (const s of block.subjects) {
          const pct = this.normalizePct(s?.completionPercentage);
          const status = this.getCompletionStatus(pct).label;
          const withMarks = Number(s?.studentsWithMarks || 0);
          rows.push({
            className,
            subjectCode: s?.subjectCode ?? '',
            subjectName: s?.subjectName ?? '',
            totalStudents,
            studentsWithMarks: withMarks,
            remaining: Math.max(0, totalStudents - withMarks),
            completionPercentage: pct,
            status
          });
        }
      }
      if (!rows.length) return;
      this.downloadCsvRows(rows);
      return;
    }

    const subjects = this.filteredSortedSubjects;
    if (!subjects.length) return;

    const totalStudents = Number(this.progressData?.totalStudents || 0);
    const className = String(this.progressData?.class?.name || '');

    const rows = subjects.map((s: any) => {
      const pct = this.normalizePct(s?.completionPercentage);
      const status = this.getCompletionStatus(pct).label;
      const withMarks = Number(s?.studentsWithMarks || 0);
      return {
        className,
        subjectCode: s?.subjectCode ?? '',
        subjectName: s?.subjectName ?? '',
        totalStudents,
        studentsWithMarks: withMarks,
        remaining: Math.max(0, totalStudents - withMarks),
        completionPercentage: pct,
        status
      };
    });
    this.downloadCsvRows(rows);
  }

  private downloadCsvRows(rows: any[]) {
    const headers = ['Class', 'Subject Code', 'Subject', 'Total Students', 'With Marks', 'Remaining', 'Completion (%)', 'Status'];
    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.className,
          r.subjectCode,
          r.subjectName,
          r.totalStudents,
          r.studentsWithMarks,
          r.remaining,
          Number.isFinite(r.completionPercentage) ? r.completionPercentage.toFixed(2) : '0.00',
          r.status
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `mark_input_progress_${stamp}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  resetFilters() {
    this.selectedClassId = '';
    this.selectedExamType = '';
    this.subjectSearch = '';
    this.viewMode = 'cards';
    this.autoLoadProgress = false;
    this.statusFilter = 'all';
    this.sortKey = 'completion';
    this.sortDir = 'desc';
    this.selectedTerm = '';
    this.loadTerms();
    this.progressData = null;
  }

  getProgressColor(percentage: number): string {
    if (percentage >= 80) return '#28a745';
    if (percentage >= 50) return '#ffc107';
    if (percentage >= 25) return '#fd7e14';
    return '#dc3545';
  }

  getProgressWidth(percentage: number): string {
    return `${Math.min(100, Math.max(0, percentage))}%`;
  }

  onAnyFilterChange() {
    if (this.autoLoadProgress) {
      this.loadProgress();
    }
  }

  getCompletionStatus(percentage: number): { label: string; cls: string } {
    if (percentage >= 80) return { label: 'On Track (80+)', cls: 'status-completed' };
    if (percentage >= 50) return { label: 'Almost Done (50+)', cls: 'status-almost' };
    if (percentage >= 25) return { label: 'In Progress (25+)', cls: 'status-progress' };
    if (percentage > 0) return { label: 'Started', cls: 'status-started' };
    return { label: 'Not Started', cls: 'status-not-started' };
  }
}
