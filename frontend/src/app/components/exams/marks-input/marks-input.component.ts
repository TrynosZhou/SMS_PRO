import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { firstValueFrom } from 'rxjs';
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
  /** Row already has a mark row on the server (allows remarks-only auto-save). */
  persisted: boolean;
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
  sortBy: 'default' | 'name' | 'number' | 'score' = 'default';
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
  private readonly AUTO_SAVE_DELAY_MS = 700;
  private autoSaveRetryTimer: ReturnType<typeof setTimeout> | null = null;

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
          .map((s: any) => ({
            id: s.id,
            name: s.name ?? '',
            code: String(s.code ?? s.subjectCode ?? '').trim()
          }));
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

  /** Subject line for dropdown and roster heading: code + name when both exist. */
  subjectDisplayLabel(s: SubjectRow): string {
    const code = (s.code || '').trim();
    const name = (s.name || '').trim();
    if (code && name) return `${code} — ${name}`;
    return name || code || '—';
  }

  getSelectedSubjectName(): string {
    const s = this.subjects.find((x) => x.id === this.selectedSubjectId);
    return s ? this.subjectDisplayLabel(s) : '';
  }

  getSelectedExamTypeLabel(): string {
    return this.examTypes.find((t) => t.value === this.selectedExamType)?.label || '';
  }

  // When any filter changes after a roster has been loaded, clear the roster
  // so the user must re-fetch with the new selection (avoids stale data).
  onFilterChange(): void {
    if (this.hasLoadedRoster) {
      if (this.autoSaveTimer !== null) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
      this.flushAutoSave();
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
    const examName = `${this.selectedTermLabel} - ${this.getSelectedExamTypeLabel()} - ${this.getSelectedClassName()}`;
    return firstValueFrom(
      this.examService.createExam({
        name: examName,
        type: this.selectedExamType,
        term: this.selectedTermLabel,
        examDate: new Date().toISOString().split('T')[0],
        classId: this.selectedClassId,
        subjectIds: [this.selectedSubjectId]
      })
    ).then((res: any) => res?.exam ?? res);
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
            this.marks[s.id] = {
              studentId: s.id,
              score: null,
              remarks: '',
              dirty: false,
              persisted: false,
              autoSavedAt: null
            };
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
      this.examService.getMarks(examId, undefined, this.selectedClassId).subscribe({
        next: (data: any) => {
          const list: any[] = Array.isArray(data) ? data : data?.marks || data?.data || [];
          list
            .filter((m) => {
              const sid = m.subjectId ?? m.subject?.id;
              return sid === this.selectedSubjectId;
            })
            .forEach((m) => {
              const row = this.marks[m.studentId];
              if (row) {
                const parsed = Number(m.score);
                row.score = Number.isFinite(parsed) ? parsed : null;
                row.remarks = m.comments ?? m.remarks ?? '';
                row.dirty = false;
                row.persisted = true;
                if (row.score !== null && row.score !== undefined) {
                  row.autoSavedAt = m.updatedAt ? new Date(m.updatedAt) : new Date();
                }
              }
            });
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  // ---------- Filter / sort ----------
  onFilterTextChange(): void {
    this.applyFilterText();
  }

  onSortChange(): void {
    this.applyFilterText();
  }

  private applyFilterText(): void {
    let list = [...this.students];
    const q = this.filterText.toLowerCase().trim();
    if (q) {
      list = list.filter((s) => {
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
    list.sort((a, b) => this.compareStudents(a, b));
    this.filteredStudents = list;
  }

  private compareStudents(a: StudentRow, b: StudentRow): number {
    if (this.sortBy === 'name') {
      const ln = String(a.lastName || '').localeCompare(String(b.lastName || ''), undefined, {
        sensitivity: 'base'
      });
      if (ln !== 0) return ln;
      return String(a.firstName || '').localeCompare(String(b.firstName || ''), undefined, {
        sensitivity: 'base'
      });
    }
    if (this.sortBy === 'number') {
      return String(a.studentNumber || '').localeCompare(String(b.studentNumber || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    }
    if (this.sortBy === 'score') {
      const sa = this.marks[a.id]?.score;
      const sb = this.marks[b.id]?.score;
      const na = sa === null || sa === undefined ? -1 : Number(sa);
      const nb = sb === null || sb === undefined ? -1 : Number(sb);
      return nb - na;
    }
    return 0;
  }

  jumpToNextEmpty(): void {
    const startIdx = this.filteredStudents.findIndex((s) => {
      const r = this.marks[s.id];
      return !r || r.score === null || r.score === undefined;
    });
    if (startIdx < 0) return;
    const student = this.filteredStudents[startIdx];
    const el = document.getElementById(`mi-score-${student.id}`) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }

  onScoreEnter(event: Event, studentId: string): void {
    event.preventDefault();
    const idx = this.filteredStudents.findIndex((s) => s.id === studentId);
    if (idx < 0) return;
    for (let i = idx + 1; i < this.filteredStudents.length; i++) {
      const s = this.filteredStudents[i];
      const r = this.marks[s.id];
      if (!r || r.score === null || r.score === undefined) {
        const el = document.getElementById(`mi-score-${s.id}`) as HTMLInputElement | null;
        el?.focus();
        el?.select();
        return;
      }
    }
    this.jumpToNextEmpty();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      if (!this.hasLoadedRoster || this.saving) return;
      event.preventDefault();
      this.saveAll();
    }
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
  /** True for a row that was loaded from server or successfully auto-saved and not dirty since. */
  isRowSaved(studentId: string): boolean {
    const r = this.marks[studentId];
    return !!(r && r.autoSavedAt && !r.dirty);
  }

  // ---------- Auto-save ----------
  private scheduleAutoSave(): void {
    if (this.autoSaveTimer !== null) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.autoSaveDirtyRows();
    }, this.AUTO_SAVE_DELAY_MS);
  }

  /** Flush pending debounce and save immediately (on blur / filter change / destroy). */
  flushAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.hasUnsaved && this.currentExam?.id && !this.autoSaving) {
      this.autoSaveDirtyRows();
    }
  }

  onFieldBlur(): void {
    this.flushAutoSave();
  }

  private buildAutoSavePayload(): Array<{
    studentId: string; subjectId: string; score: number; maxScore: number; comments: string;
  }> {
    return this.students
      .map((s) => {
        const r = this.marks[s.id];
        if (!r || !r.dirty) return null;
        if (r.score === null || r.score === undefined) return null;
        return {
          studentId: s.id,
          subjectId: this.selectedSubjectId,
          score: Number(r.score),
          maxScore: this.maxScore,
          comments: r.remarks || ''
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }

  private autoSaveDirtyRows(): void {
    if (!this.currentExam?.id) return;
    if (this.saving || this.autoSaving) {
      this.scheduleAutoSave();
      return;
    }

    const payload = this.buildAutoSavePayload();
    if (payload.length === 0) return;

    // Capture IDs before async call so we clear the right rows
    const sentIds = new Set(payload.map((p) => p.studentId));

    this.autoSaving = true;
    this.examService.captureMarks(this.currentExam.id, payload).subscribe({
      next: (res: any) => {
        const now = new Date();
        const savedCount = Number(res?.savedCount ?? 0);
        const invalidMarks: any[] = Array.isArray(res?.invalidMarks) ? res.invalidMarks : [];
        const invalidStudentIds = new Set(invalidMarks.map((m: any) => String(m?.studentId || '')));

        if (savedCount <= 0) {
          this.autoSaving = false;
          this.error = res?.message || 'Auto-save failed: no rows were stored.';
          this.dismissError();
          if (this.hasUnsaved) this.scheduleAutoSave();
          return;
        }

        this.lastAutoSavedAt = now;
        this.lastSavedAt = now;
        this.error = '';
        sentIds.forEach((id) => {
          if (invalidStudentIds.has(String(id))) return;
          const r = this.marks[id];
          if (!r) return;
          // Only clear dirty if the value hasn't changed while the request was in-flight.
          const sent = payload.find((p) => p.studentId === id);
          if (sent && r.score === sent.score && (r.remarks || '') === (sent.comments || '')) {
            r.dirty = false;
            r.persisted = true;
            r.autoSavedAt = now;
          }
        });
        if (invalidStudentIds.size > 0) {
          this.error = `Saved ${savedCount}, but ${invalidStudentIds.size} row(s) were rejected.`;
          this.dismissError();
        }
        this.autoSaving = false;
        if (this.hasUnsaved) this.scheduleAutoSave();
      },
      error: (err: any) => {
        this.autoSaving = false;
        const msg = err?.error?.message || '';
        this.error = msg || 'Auto-save failed — will retry';
        this.dismissError();
        if (this.autoSaveRetryTimer !== null) clearTimeout(this.autoSaveRetryTimer);
        this.autoSaveRetryTimer = setTimeout(() => {
          this.autoSaveRetryTimer = null;
          if (this.hasUnsaved) this.autoSaveDirtyRows();
        }, 3000);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.autoSaveRetryTimer !== null) {
      clearTimeout(this.autoSaveRetryTimer);
      this.autoSaveRetryTimer = null;
    }
    // Best-effort flush before component tears down
    const payload = this.buildAutoSavePayload();
    if (payload.length > 0 && this.currentExam?.id) {
      this.examService.captureMarks(this.currentExam.id, payload).subscribe();
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

  get remainingCount(): number {
    return Math.max(0, this.totalCount - this.markedCount);
  }

  get completionPercent(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.markedCount / this.totalCount) * 100);
  }

  get filtersReadyCount(): number {
    let n = 0;
    if (this.selectedTermLabel) n++;
    if (this.selectedExamType) n++;
    if (this.selectedClassId) n++;
    if (this.selectedSubjectId) n++;
    return n;
  }

  get averageScore(): number | null {
    const scored = this.students.filter((s) => {
      const sc = this.marks[s.id]?.score;
      return sc !== null && sc !== undefined;
    });
    if (scored.length === 0) return null;
    const sum = scored.reduce((acc, s) => acc + (this.marks[s.id]?.score as number), 0);
    return Math.round((sum / scored.length) * 10) / 10;
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
    // Cancel any pending auto-save — we're doing a full save now
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    // Always include ALL rows that have a score, whether dirty or not.
    const payload = this.students
      .map((s) => {
        const row = this.marks[s.id];
        if (!row || row.score === null || row.score === undefined) return null;
        return {
          studentId: s.id,
          subjectId: this.selectedSubjectId,
          score: Number(row.score),
          maxScore: this.maxScore,
          comments: row.remarks || ''
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

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
        const savedCount = Number(res?.savedCount ?? 0);
        const invalidMarks: any[] = Array.isArray(res?.invalidMarks) ? res.invalidMarks : [];
        const invalidStudentIds = new Set(invalidMarks.map((m: any) => String(m?.studentId || '')));
        this.saving = false;

        if (savedCount <= 0) {
          this.error = res?.message || 'No marks were saved.';
          this.dismissError();
          return;
        }

        this.success = `Saved ${savedCount} mark(s) successfully`;
        const now = new Date();
        this.lastSavedAt = now;
        this.lastAutoSavedAt = now;
        this.students.forEach((s) => {
          const r = this.marks[s.id];
          if (!r || invalidStudentIds.has(String(s.id))) return;
          r.dirty = false;
          r.persisted = true;
          r.autoSavedAt = r.score !== null && r.score !== undefined ? now : r.autoSavedAt;
        });
        if (invalidStudentIds.size > 0) {
          this.error = `${invalidStudentIds.size} row(s) were rejected by the server.`;
          this.dismissError();
        }
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
