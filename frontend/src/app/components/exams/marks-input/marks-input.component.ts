import { Component, OnDestroy, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import {
  getGradeInfoFromSettingsRow,
  scoreToPercent
} from '../../../utils/gradingFromSettings';

interface TermRow {
  id: string;
  termNumber?: number | string;
  year?: number | string;
  label: string;
  status?: string;
}

interface ClassRow {
  id: string;
  name: string;
  form?: string;
  isActive?: boolean;
}

interface SubjectRow {
  id: string;
  name: string;
  code: string;
}

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  gender?: string;
}

interface MarkRow {
  studentId: string;
  score: number | null;
  remarks: string;
  dirty: boolean;
  /** Timestamp of the last successful save (auto or manual) for this row. Drives the ✓✓ indicator. */
  autoSavedAt: Date | null;
}

@Component({
  selector: 'app-marks-input',
  templateUrl: './marks-input.component.html',
  styleUrls: ['./marks-input.component.css']
})
export class MarksInputComponent implements OnInit, OnDestroy {
  // Filter selections
  terms: TermRow[] = [];
  classes: ClassRow[] = [];
  subjects: SubjectRow[] = [];
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];
  selectedTermLabel = '';
  selectedExamType = '';
  selectedClassId = '';
  selectedSubjectId = '';

  // Loading flags
  loadingTerms = false;
  loadingClasses = false;
  loadingSubjects = false;
  loadingStudents = false;
  saving = false;

  // Roster + marks
  currentExam: any = null;
  students: StudentRow[] = [];
  filteredStudents: StudentRow[] = [];
  marks: Record<string, MarkRow> = {};

  filterText = '';
  maxScore = 100;

  // Status
  error = '';
  success = '';
  hasLoadedRoster = false;
  lastSavedAt: Date | null = null;

  // ── Auto-save state ─────────────────────────────────────────────────────
  /** True while a debounced auto-save HTTP call is in flight. */
  autoSaving = false;
  /** Timestamp of the most recent successful auto-save (used by the page-level pill). */
  lastAutoSavedAt: Date | null = null;
  /** Pending debounce handle so we can cancel/reschedule on each keystroke. */
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Debounce delay (ms) — short enough to feel "instant", long enough to coalesce keystrokes. */
  private readonly AUTO_SAVE_DELAY_MS = 1000;

  /**
   * Same settings row as Academic Settings → Grading (`getSettings()`).
   * `undefined` = still loading; `null` = load failed.
   */
  private gradingSettingsRow: Record<string, unknown> | null | undefined = undefined;

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private studentService: StudentService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.loadGradingSettings();
    this.loadTerms();
    this.loadClasses();
    this.loadAllSubjects();
  }

  private loadGradingSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.gradingSettingsRow =
          row && typeof row === 'object' ? { ...(row as Record<string, unknown>) } : {};
      },
      error: () => {
        this.gradingSettingsRow = null;
      }
    });
  }

  // ---------- Loaders ----------
  loadTerms(): void {
    this.loadingTerms = true;
    this.settingsService.getTerms().subscribe({
      next: (data: any) => {
        const raw: any[] = Array.isArray(data) ? data : data?.terms || [];
        this.terms = raw.map((t) => ({
          ...t,
          label: `Term ${t.termNumber} ${t.year}`
        }));
        this.loadingTerms = false;
        if (!this.selectedTermLabel) {
          const active = this.terms.find((t) => t.status === 'active');
          if (active) this.selectedTermLabel = active.label;
        }
      },
      error: () => {
        this.terms = [];
        this.loadingTerms = false;
      }
    });
  }

  loadClasses(): void {
    this.loadingClasses = true;
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const active = list.filter((c: any) => c.isActive !== false);
        this.classes = this.classService.sortClasses(active);
        this.loadingClasses = false;
      },
      error: () => {
        this.classes = [];
        this.loadingClasses = false;
      }
    });
  }

  loadAllSubjects(): void {
    this.loadingSubjects = true;
    this.subjectService.getSubjects({ page: 1, limit: 500 }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.subjects = list
          .filter((s: any) => s.isActive !== false)
          .map((s: any) => ({ id: s.id, name: s.name, code: s.code }));
        this.loadingSubjects = false;
      },
      error: () => {
        this.subjects = [];
        this.loadingSubjects = false;
      }
    });
  }

  get canFetch(): boolean {
    return (
      !!this.selectedTermLabel &&
      !!this.selectedExamType &&
      !!this.selectedClassId &&
      !!this.selectedSubjectId
    );
  }

  getSelectedClassName(): string {
    return this.classes.find((c) => c.id === this.selectedClassId)?.name || '';
  }

  getSelectedSubjectName(): string {
    return this.subjects.find((s) => s.id === this.selectedSubjectId)?.name || '';
  }

  getSelectedExamTypeLabel(): string {
    return this.examTypes.find((t) => t.value === this.selectedExamType)?.label || '';
  }

  // When any filter changes after a roster has been loaded, clear the roster
  // so the user must re-fetch with the new selection (avoids stale data).
  onFilterChange(): void {
    if (this.hasLoadedRoster) {
      // Cancel any pending auto-save so we don't post stale rows against the previous selection.
      if (this.autoSaveTimer !== null) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
      this.hasLoadedRoster = false;
      this.currentExam = null;
      this.students = [];
      this.filteredStudents = [];
      this.marks = {};
      this.success = '';
      this.lastAutoSavedAt = null;
    }
  }

  // ---------- Fetch class roster + marks ----------
  fetchRoster(): void {
    if (!this.canFetch) {
      this.error = 'Please choose Term, Exam Type, Class, and Subject.';
      this.dismissError();
      return;
    }
    this.error = '';
    this.success = '';
    this.loadingStudents = true;

    this.findOrCreateExam()
      .then((exam) => {
        this.currentExam = exam;
        this.loadStudentsForClass(this.selectedClassId).then(() => {
          this.loadExistingMarks(exam.id).then(() => {
            this.hasLoadedRoster = true;
            this.loadingStudents = false;
            this.applyFilterText();
          });
        });
      })
      .catch((err: any) => {
        this.loadingStudents = false;
        this.error = err?.error?.message || err?.message || 'Failed to load exam';
        this.dismissError();
      });
  }

  private findOrCreateExam(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.examService.getExams(this.selectedClassId).subscribe({
        next: (raw: any) => {
          const exams: any[] = Array.isArray(raw) ? raw : raw?.data || [];
          const existing = exams.find(
            (e) =>
              e.term === this.selectedTermLabel &&
              e.type === this.selectedExamType &&
              e.classId === this.selectedClassId &&
              (e.subjects || []).some((s: any) => s.id === this.selectedSubjectId)
          );
          if (existing) {
            resolve(existing);
            return;
          }
          // Create a new one with this single subject
          const examName = `${this.selectedTermLabel} - ${this.getSelectedExamTypeLabel()} - ${this.getSelectedClassName()}`;
          this.examService
            .createExam({
              name: examName,
              type: this.selectedExamType,
              term: this.selectedTermLabel,
              examDate: new Date().toISOString().split('T')[0],
              classId: this.selectedClassId,
              subjectIds: [this.selectedSubjectId]
            })
            .subscribe({
              // The backend returns { message, exam } from POST /api/exams; the exam itself (with `id`)
              // is the `exam` property. Without this unwrap, `currentExam.id` ends up undefined and
              // a subsequent save would POST to /api/exams/marks with no examId (→ 400).
              next: (created: any) => resolve(created?.exam ?? created),
              error: (err: any) => reject(err)
            });
        },
        error: (err: any) => reject(err)
      });
    });
  }

  private loadStudentsForClass(classId: string): Promise<void> {
    return new Promise((resolve) => {
      this.studentService.getStudents({ classId }).subscribe({
        next: (data: any) => {
          const list = Array.isArray(data) ? data : data?.data || [];
          this.students = list
            .filter((s: any) => s.isActive !== false)
            .sort((a: any, b: any) => {
              const ln = String(a.lastName || '').localeCompare(String(b.lastName || ''), undefined, {
                sensitivity: 'base'
              });
              if (ln !== 0) return ln;
              return String(a.firstName || '').localeCompare(String(b.firstName || ''), undefined, {
                sensitivity: 'base'
              });
            })
            .map((s: any) => ({
              id: s.id,
              firstName: s.firstName,
              lastName: s.lastName,
              studentNumber: s.studentNumber || '',
              gender: s.gender || ''
            }));
          // Initialize marks map
          this.marks = {};
          this.students.forEach((s) => {
            this.marks[s.id] = { studentId: s.id, score: null, remarks: '', dirty: false, autoSavedAt: null };
          });
          resolve();
        },
        error: () => {
          this.students = [];
          this.marks = {};
          resolve();
        }
      });
    });
  }

  private loadExistingMarks(examId: string): Promise<void> {
    return new Promise((resolve) => {
      this.examService.getMarks(examId).subscribe({
        next: (data: any) => {
          const list: any[] = Array.isArray(data) ? data : data?.marks || data?.data || [];
          list
            .filter((m) => m.subjectId === this.selectedSubjectId)
            .forEach((m) => {
              const row = this.marks[m.studentId];
              if (row) {
                row.score = typeof m.score === 'number' ? m.score : Number(m.score) || null;
                // Backend / DB field is `comments` (per-subject teacher remark)
                row.remarks = m.comments ?? m.remarks ?? '';
                row.dirty = false;
              }
            });
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  // ---------- Filter ----------
  onFilterTextChange(): void {
    this.applyFilterText();
  }

  private applyFilterText(): void {
    if (!this.filterText.trim()) {
      this.filteredStudents = [...this.students];
      return;
    }
    const q = this.filterText.toLowerCase().trim();
    this.filteredStudents = this.students.filter((s) => {
      const full = `${s.lastName} ${s.firstName}`.toLowerCase();
      const number = (s.studentNumber || '').toLowerCase();
      return (
        full.includes(q) ||
        (s.lastName || '').toLowerCase().includes(q) ||
        (s.firstName || '').toLowerCase().includes(q) ||
        number.includes(q)
      );
    });
  }

  // ---------- Mark editing ----------
  onScoreChange(studentId: string, value: any): void {
    const row = this.marks[studentId];
    if (!row) return;
    if (value === '' || value === null || value === undefined) {
      row.score = null;
    } else {
      const n = Number(value);
      if (Number.isNaN(n)) {
        row.score = null;
      } else {
        row.score = Math.max(0, Math.min(this.maxScore, n));
      }
    }
    row.dirty = true;
    // A fresh keystroke invalidates the previous "saved" indicator until the next auto-save lands.
    row.autoSavedAt = null;
    this.scheduleAutoSave();
  }

  onRemarksChange(studentId: string, value: string): void {
    const row = this.marks[studentId];
    if (!row) return;
    row.remarks = value;
    row.dirty = true;
    row.autoSavedAt = null;
    this.scheduleAutoSave();
  }

  // ---------- Auto-save ----------
  /** True for a row that has been auto-saved and hasn't been edited since (drives the ✓✓ tick). */
  isRowSaved(studentId: string): boolean {
    const r = this.marks[studentId];
    return !!(r && r.autoSavedAt && !r.dirty);
  }

  /** Debounced auto-save: every edit re-arms the timer so we coalesce rapid keystrokes. */
  private scheduleAutoSave(): void {
    if (this.autoSaveTimer !== null) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.autoSaveDirtyRows();
    }, this.AUTO_SAVE_DELAY_MS);
  }

  /** Persist all currently dirty rows that have a usable score. Rows without a score are skipped
   *  (the backend rejects them anyway, and we don't want to wipe partial entries). */
  private autoSaveDirtyRows(): void {
    if (!this.currentExam || !this.currentExam.id) return;
    // If a manual save is mid-flight, re-arm the debounce and try again shortly.
    if (this.saving || this.autoSaving) {
      this.scheduleAutoSave();
      return;
    }

    const dirtyRows = this.students.filter((s) => {
      const r = this.marks[s.id];
      return r && r.dirty && r.score !== null && r.score !== undefined;
    });
    if (dirtyRows.length === 0) return;

    const payload = dirtyRows.map((s) => {
      const r = this.marks[s.id] as MarkRow;
      return {
        studentId: s.id,
        subjectId: this.selectedSubjectId,
        score: r.score as number,
        comments: r.remarks || '',
      };
    });

    this.autoSaving = true;
    this.examService.captureMarks(this.currentExam.id, payload).subscribe({
      next: () => {
        const now = new Date();
        this.lastAutoSavedAt = now;
        this.lastSavedAt = now;
        // Only stamp rows that were still pristine since the request went out — anything edited
        // mid-flight stays `dirty` so it gets picked up in the next debounce window.
        dirtyRows.forEach((s) => {
          const r = this.marks[s.id];
          if (!r) return;
          if (r.dirty) {
            r.dirty = false;
            r.autoSavedAt = now;
          }
        });
        this.autoSaving = false;
      },
      error: () => {
        // Leave dirty flags untouched so the next debounce or manual save can retry.
        this.autoSaving = false;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  get markedCount(): number {
    return this.students.filter((s) => {
      const r = this.marks[s.id];
      return r && r.score !== null && r.score !== undefined;
    }).length;
  }

  get totalCount(): number {
    return this.students.length;
  }

  get hasUnsaved(): boolean {
    return this.students.some((s) => this.marks[s.id]?.dirty);
  }

  /** Grade label from Academic Settings → Grading (percentage of `score / maxScore`). */
  gradeLabel(score: number | null | undefined): string {
    if (score === null || score === undefined) return '';
    if (this.gradingSettingsRow === undefined) return '';
    if (this.gradingSettingsRow === null) return '—';
    const s = Number(score);
    if (Number.isNaN(s)) return '';
    const pct = scoreToPercent(s, this.maxScore);
    return getGradeInfoFromSettingsRow(pct, this.gradingSettingsRow).label;
  }

  /** CSS tier keyed like backend (`veryGood`, …, `band5`, `fail`). */
  gradeClass(score: number | null | undefined): string {
    if (score === null || score === undefined) return '';
    if (this.gradingSettingsRow === undefined) return '';
    if (this.gradingSettingsRow === null) return 'mi-grade mi-grade--fail';
    const s = Number(score);
    if (Number.isNaN(s)) return '';
    const pct = scoreToPercent(s, this.maxScore);
    const { key } = getGradeInfoFromSettingsRow(pct, this.gradingSettingsRow);
    return `mi-grade mi-grade--${key}`;
  }

  // ---------- Save ----------
  saveAll(): void {
    if (!this.currentExam || !this.currentExam.id) {
      this.error = 'No exam loaded. Please fetch the class roster first.';
      this.dismissError();
      return;
    }
    const payload = this.students
      .map((s) => {
        const row = this.marks[s.id];
        if (!row) return null;
        if (row.score === null || row.score === undefined) return null;
        return {
          studentId: s.id,
          subjectId: this.selectedSubjectId,
          score: row.score,
          comments: row.remarks || '',
        };
      })
      .filter((x): x is { studentId: string; subjectId: string; score: number; comments: string } => !!x);

    if (payload.length === 0) {
      this.error = 'No marks to save — enter at least one score.';
      this.dismissError();
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';

    this.examService.captureMarks(this.currentExam.id, payload).subscribe({
      next: (res: any) => {
        this.success = res?.message || `Saved ${payload.length} mark(s) successfully`;
        this.saving = false;
        const now = new Date();
        this.lastSavedAt = now;
        this.lastAutoSavedAt = now;
        // Reset dirty flags and stamp the row-level "saved" tick so the ✓✓ indicator lights up
        // for every row included in this batch (same indicator as auto-save).
        this.students.forEach((s) => {
          const r = this.marks[s.id];
          if (!r) return;
          r.dirty = false;
          if (r.score !== null && r.score !== undefined) {
            r.autoSavedAt = now;
          }
        });
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to save marks';
        this.saving = false;
        this.dismissError();
      }
    });
  }

  clearScores(): void {
    if (!confirm('Clear all scores entered in this table (unsaved changes will be lost)?')) return;
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.students.forEach((s) => {
      const row = this.marks[s.id];
      if (row) {
        row.score = null;
        row.remarks = '';
        row.dirty = true;
        row.autoSavedAt = null;
      }
    });
  }

  private dismissError(): void {
    setTimeout(() => (this.error = ''), 5000);
  }

  trackByStudent = (_: number, s: StudentRow) => s.id;
}
