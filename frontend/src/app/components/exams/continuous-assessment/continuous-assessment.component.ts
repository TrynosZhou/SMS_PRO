import { Component, OnDestroy, OnInit } from '@angular/core';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';

interface ClassRow {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
}

interface MarkRow {
  score: number | null;
  dirty: boolean;
  autoSavedAt: Date | null;
}

const STORAGE_PREFIX = 'sms_continuous_marks:v1';

@Component({
  selector: 'app-continuous-assessment',
  templateUrl: './continuous-assessment.component.html',
  styleUrls: ['./continuous-assessment.component.css', '../marks-input/marks-input.component.css'],
})
export class ContinuousAssessmentComponent implements OnInit, OnDestroy {
  classes: ClassRow[] = [];
  selectedClassId = '';
  topicSkill = '';
  assessmentDate = '';

  assessmentTypes = [
    { value: 'exercise', label: 'Exercise' },
    { value: 'quiz', label: 'Quiz' },
    { value: 'test', label: 'Test' },
    { value: 'project', label: 'Project' },
    { value: 'homework', label: 'Homework' },
    { value: 'other', label: 'Other' },
  ];
  selectedAssessmentType = 'exercise';

  /** Optional cap for scores (optional text field). */
  outOfStr = '';

  loading = false;
  error = '';
  hasLoadedRoster = false;
  students: StudentRow[] = [];
  marks: Record<string, MarkRow> = {};
  maxScore = 100;

  autoSaving = false;
  lastAutoSavedAt: Date | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly AUTO_SAVE_DELAY_MS = 1000;

  constructor(private classService: ClassService, private studentService: StudentService) {}

  ngOnInit(): void {
    this.assessmentDate = new Date().toISOString().slice(0, 10);
    this.loadClasses();
  }

  ngOnDestroy(): void {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  loadClasses(): void {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const active = list.filter((c: any) => c.isActive !== false);
        this.classes = this.classService.sortClasses(active);
      },
      error: () => {
        this.classes = [];
      },
    });
  }

  get canLoad(): boolean {
    return !!(this.selectedClassId && this.topicSkill.trim() && this.assessmentDate);
  }

  get selectedAssessmentLabel(): string {
    return this.assessmentTypes.find((t) => t.value === this.selectedAssessmentType)?.label || '';
  }

  getSelectedClassName(): string {
    return this.classes.find((c) => c.id === this.selectedClassId)?.name || '';
  }

  private storageKey(): string {
    const topic = (this.topicSkill || '').trim().slice(0, 120);
    return `${STORAGE_PREFIX}:${this.selectedClassId}:${this.assessmentDate}:${this.selectedAssessmentType}:${topic}:${this.maxScore}`;
  }

  loadClassList(): void {
    if (!this.canLoad) {
      this.error = 'Please select a class, enter a topic / skill, and choose a date.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.error = '';
    this.loading = true;
    this.studentService.getStudents({ classId: this.selectedClassId }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.students = list
          .filter((s: any) => s.isActive !== false)
          .sort((a: any, b: any) => {
            const ln = String(a.lastName || '').localeCompare(String(b.lastName || ''), undefined, {
              sensitivity: 'base',
            });
            if (ln !== 0) return ln;
            return String(a.firstName || '').localeCompare(String(b.firstName || ''), undefined, {
              sensitivity: 'base',
            });
          })
          .map((s: any) => ({
            id: s.id,
            studentNumber: s.studentNumber || '',
            firstName: s.firstName || '',
            lastName: s.lastName || '',
          }));
        this.marks = {};
        this.students.forEach((s) => {
          this.marks[s.id] = { score: null, dirty: false, autoSavedAt: null };
        });
        this.applyMaxFromOutOf();
        this.hasLoadedRoster = true;
        this.loading = false;
        this.restoreDraft();
        this.lastAutoSavedAt = null;
      },
      error: () => {
        this.students = [];
        this.marks = {};
        this.hasLoadedRoster = false;
        this.loading = false;
        this.error = 'Failed to load students for this class.';
        setTimeout(() => (this.error = ''), 5000);
      },
    });
  }

  private restoreDraft(): void {
    let raw: string | null;
    try {
      raw = localStorage.getItem(this.storageKey());
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { scores?: Record<string, number | null>; savedAt?: string };
      const savedAt = data.savedAt ? new Date(data.savedAt) : new Date();
      const scores = data.scores || {};
      Object.keys(scores).forEach((sid) => {
        const row = this.marks[sid];
        if (!row) return;
        const sc = scores[sid] as number | string | null | undefined;
        if (sc === null || sc === undefined || sc === '') {
          row.score = null;
        } else {
          const n = Number(sc);
          row.score = Number.isNaN(n) ? null : Math.max(0, Math.min(this.maxScore, n));
        }
        row.dirty = false;
        row.autoSavedAt = row.score !== null && row.score !== undefined ? savedAt : null;
      });
      if (Object.keys(scores).length) {
        this.lastAutoSavedAt = savedAt;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  private persistDraft(): void {
    if (!this.hasLoadedRoster || !this.students.length) return;

    this.autoSaving = true;
    const scores: Record<string, number | null> = {};
    this.students.forEach((s) => {
      scores[s.id] = this.marks[s.id]?.score ?? null;
    });
    const payload = {
      v: 1,
      savedAt: new Date().toISOString(),
      scores,
      topicSkill: this.topicSkill.trim(),
      classId: this.selectedClassId,
      assessmentDate: this.assessmentDate,
      assessmentType: this.selectedAssessmentType,
      maxScore: this.maxScore,
    };
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(payload));
      const now = new Date();
      this.lastAutoSavedAt = now;
      this.students.forEach((s) => {
        const r = this.marks[s.id];
        if (!r) return;
        r.dirty = false;
        if (r.score !== null && r.score !== undefined) {
          r.autoSavedAt = now;
        } else {
          r.autoSavedAt = null;
        }
      });
    } catch {
      /* quota or private mode */
    }
    this.autoSaving = false;
  }

  private scheduleAutoSave(): void {
    if (this.autoSaveTimer !== null) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.persistDraft();
    }, this.AUTO_SAVE_DELAY_MS);
  }

  isRowSaved(studentId: string): boolean {
    const r = this.marks[studentId];
    return !!(r && r.autoSavedAt && !r.dirty && r.score !== null && r.score !== undefined);
  }

  get hasUnsaved(): boolean {
    return this.students.some((s) => this.marks[s.id]?.dirty);
  }

  private parsedOutOf(): number | null {
    const v = String(this.outOfStr ?? '').trim();
    if (!v) return null;
    const n = Number(v);
    if (Number.isNaN(n) || n <= 0) return null;
    return Math.floor(n);
  }

  private applyMaxFromOutOf(): void {
    const cap = this.parsedOutOf();
    if (cap !== null) {
      this.maxScore = cap;
    } else {
      this.maxScore = 100;
    }
  }

  /** Updates the score cap from "Out of" and clamps entered scores. */
  applyOutOfToAllRows(): void {
    this.applyMaxFromOutOf();
    Object.keys(this.marks).forEach((id) => {
      const row = this.marks[id];
      if (!row) return;
      const v = row.score;
      if (v !== null && v !== undefined && v > this.maxScore) {
        row.score = this.maxScore;
      }
      row.dirty = true;
      row.autoSavedAt = null;
    });
    this.scheduleAutoSave();
  }

  onScoreChange(studentId: string, value: string): void {
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
    row.autoSavedAt = null;
    this.scheduleAutoSave();
  }

  trackByStudent = (_: number, s: StudentRow) => s.id;
}
