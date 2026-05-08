import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { ClassService } from '../../../services/class.service';
import { TimetableService } from '../../../services/timetable.service';

export interface SubjectAssignmentRow {
  /** Backend teacher_contract_lessons.id; independent rows per class+subject. */
  contractLessonId?: string | null;
  subjectId: string | null;
  subjectName: string;
  /** Syllabus code from subjects.code (e.g. 0478, 9618) */
  subjectCode: string | null;
  shortTitle: string | null;
  subjectCategory?: 'O_LEVEL' | 'A_LEVEL' | null;
  classId: string;
  className: string;
  classForm: string | null;
  lessonsPerWeek: number;
  isDoublePeriod?: boolean;
  weeklyPeriodLoad?: number;
  placeholder?: boolean;
}

export interface AssignedClassRef {
  id: string;
  name: string;
  classForm: string | null;
}

@Component({
  selector: 'app-teacher-subject-contact',
  templateUrl: './teacher-subject-contact.component.html',
  styleUrls: ['./teacher-subject-contact.component.css'],
})
export class TeacherSubjectContactComponent implements OnInit {
  teacherId = '';
  teacher: {
    id: string;
    teacherId: string;
    firstName: string;
    lastName: string;
    shortName: string;
    qualification?: string | null;
  } | null = null;
  /** Subjects on the teacher profile — only these appear in the lesson modal (with class overlap). */
  teacherSubjectsAllocated: Array<{
    id: string;
    name: string;
    code?: string | null;
    shortTitle?: string | null;
    category?: string | null;
  }> = [];
  rows: SubjectAssignmentRow[] = [];
  assignedClasses: AssignedClassRef[] = [];
  totalWeeklyLessons = 0;
  loading = false;
  error = '';
  success = '';

  /** Route param or loaded teacher UUID — used for API calls. */
  get apiTeacherKey(): string {
    return this.teacher?.id || this.teacherId;
  }

  /** Opens Assign classes with this teacher auto-selected (`AssignClassesComponent` reads `teacherId`). */
  readonly assignClassesRoute = ['/teachers/manage/assign-classes'] as const;

  get assignClassesTeacherQuery(): { teacherId: string } {
    return { teacherId: this.apiTeacherKey };
  }

  allClasses: Array<{ id: string; name: string; form?: string | null }> = [];
  loadingClasses = false;

  selectedRow: SubjectAssignmentRow | null = null;

  lessonModalOpen = false;
  lessonModalMode: 'new' | 'edit' = 'new';
  modalClassId = '';
  modalSubjectId = '';
  /** Lessons/week from active timetable config, keyed by subject id. */
  lessonsMap: Record<string, number> = {};
  /** Periods per week for the selected subject (writes to Timetable → Configuration). */
  modalLessonsPerWeek = 3;
  /** Each session counts as 1 period (single) or 2 periods (double) toward load and generation. */
  modalLessonLength: 'single' | 'double' = 'single';
  modalSubjects: Array<{
    id: string;
    name: string;
    code?: string | null;
    category?: string | null;
  }> = [];
  loadingModalSubjects = false;
  modalSaving = false;
  modalError = '';
  /** Shown under the subject dropdown when there are no selectable options. */
  modalSubjectHelp = '';
  /** When editing, backend row id (update in place instead of inserting another line). */
  modalContractLessonId: string | null = null;
  private editOriginal: { classId: string; subjectId: string; contractLessonId?: string | null } | null =
    null;

  get modalIsDoublePeriod(): boolean {
    return this.modalLessonLength === 'double';
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private teacherService: TeacherService,
    private classService: ClassService,
    private timetableService: TimetableService
  ) {}

  ngOnInit(): void {
    this.loadAllClasses();
    this.route.paramMap.subscribe((pm) => {
      const id = pm.get('teacherId') || '';
      if (!id) {
        this.error = 'Missing teacher.';
        return;
      }
      this.teacherId = id;
      this.selectedRow = null;
      this.load();
    });
  }

  loadAllClasses(): void {
    this.loadingClasses = true;
    this.classService.getClasses({ limit: 500 }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.allClasses = this.classService.sortClasses(list);
        this.loadingClasses = false;
      },
      error: () => {
        this.allClasses = [];
        this.loadingClasses = false;
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.teacherService.getTeacherSubjectAssignment(this.teacherId).subscribe({
      next: (data) => {
        this.teacher = data?.teacher || null;
        this.teacherSubjectsAllocated = Array.isArray(data?.teacherSubjects) ? data.teacherSubjects : [];
        this.rows = data?.rows || [];
        this.assignedClasses = data?.assignedClasses || [];
        this.totalWeeklyLessons = data?.totalWeeklyLessons ?? 0;
        this.loading = false;
        this.syncSelectedRowAfterLoad();
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to load assignment contract.';
        this.loading = false;
      },
    });
  }

  private syncSelectedRowAfterLoad(): void {
    if (!this.selectedRow || this.selectedRow.placeholder || !this.selectedRow.subjectId) {
      return;
    }
    const wantLine = this.selectedRow.contractLessonId ?? '';
    const match = this.rows.find(
      (r) =>
        !r.placeholder &&
        r.subjectId === this.selectedRow!.subjectId &&
        r.classId === this.selectedRow!.classId &&
        (r.contractLessonId ?? '') === wantLine
    );
    this.selectedRow = match || null;
  }

  back(): void {
    this.router.navigate(['/teachers/manage', 'teacher_subject']);
  }

  displayTeacherName(): string {
    if (!this.teacher) {
      return 'Teacher';
    }
    return `${this.teacher.firstName || ''} ${this.teacher.lastName || ''}`.trim();
  }

  /** Primary cell: syllabus code from Subject → Code (e.g. 0478, 9618); never prefer short title when showing syllabus. */
  subjectCell(r: SubjectAssignmentRow): string {
    if (r.placeholder || r.subjectId == null) {
      return '—';
    }
    const code = (r.subjectCode || '').trim();
    if (code) {
      return code;
    }
    return r.subjectName || '—';
  }

  subjectCategoryLabel(r: SubjectAssignmentRow): string {
    const c = r.subjectCategory;
    if (c === 'O_LEVEL') {
      return 'O Level';
    }
    if (c === 'A_LEVEL') {
      return 'A Level';
    }
    return '';
  }

  /** Second line under syllabus code: full name and level when useful. */
  subjectSecondaryLine(r: SubjectAssignmentRow): string {
    if (r.placeholder || !r.subjectId) {
      return '';
    }
    const primary = this.subjectCell(r);
    const name = (r.subjectName || '').trim();
    const cat = this.subjectCategoryLabel(r);
    const bits: string[] = [];
    if (name && primary !== name) {
      bits.push(name);
    }
    if (cat) {
      bits.push(cat);
    }
    return bits.join(' · ');
  }

  modalSubjectOptionLabel(s: { name: string; code?: string | null; category?: string | null }): string {
    const code = (s.code || '').trim();
    const cat =
      s.category === 'A_LEVEL' ? 'A Level' : s.category === 'O_LEVEL' ? 'O Level' : '';
    const nm = (s.name || '').trim() || '—';
    if (code) {
      return cat ? `${code} — ${nm} (${cat})` : `${code} — ${nm}`;
    }
    return cat ? `${nm} (${cat})` : nm;
  }

  classCell(r: SubjectAssignmentRow): string {
    let s = r.className || '—';
    if (r.classForm != null && String(r.classForm).trim() !== '') {
      s += ` (${String(r.classForm).trim()})`;
    }
    return s;
  }

  classChipLabel(c: AssignedClassRef): string {
    let s = c.name || '—';
    if (c.classForm != null && String(c.classForm).trim() !== '') {
      s += ` (${String(c.classForm).trim()})`;
    }
    return s;
  }

  rowTrackKey(r: SubjectAssignmentRow): string {
    return `${r.classId}|${r.subjectId ?? 'ph'}|${r.contractLessonId ?? 'legacy'}`;
  }

  isRowSelected(r: SubjectAssignmentRow): boolean {
    if (!this.selectedRow) {
      return false;
    }
    return this.rowTrackKey(r) === this.rowTrackKey(this.selectedRow);
  }

  selectContractRow(r: SubjectAssignmentRow, ev?: Event): void {
    ev?.stopPropagation();
    this.selectedRow = r;
  }

  /** Double-click a data row to open the same edit modal as the Edit lesson button. */
  onContractRowDblClick(r: SubjectAssignmentRow, ev: Event): void {
    ev.stopPropagation();
    if (r.placeholder || !r.subjectId) {
      this.selectContractRow(r, ev);
      return;
    }
    this.selectedRow = r;
    this.openEditLesson();
  }

  canEditOrRemove(): boolean {
    return Boolean(this.selectedRow && !this.selectedRow.placeholder && this.selectedRow.subjectId);
  }

  openNewLessonFromHint(ev: Event): void {
    ev.stopPropagation();
    this.openNewLesson();
  }

  openNewLesson(): void {
    this.lessonModalMode = 'new';
    this.editOriginal = null;
    this.modalContractLessonId = null;
    this.modalClassId = '';
    this.modalSubjectId = '';
    this.modalSubjects = [];
    this.modalError = '';
    this.modalLessonsPerWeek = 3;
    this.modalLessonLength = 'single';
    this.timetableService.getConfig().subscribe({
      next: (c) => {
        this.lessonsMap = { ...(c.lessonsPerWeek || {}) };
        this.lessonModalOpen = true;
      },
      error: () => {
        this.lessonsMap = {};
        this.lessonModalOpen = true;
      },
    });
  }

  openEditLesson(): void {
    if (!this.canEditOrRemove() || !this.selectedRow?.subjectId) {
      return;
    }
    const row = this.selectedRow;
    const sid = row.subjectId as string;
    this.lessonModalMode = 'edit';
    this.editOriginal = {
      classId: row.classId,
      subjectId: sid,
      contractLessonId: row.contractLessonId ?? null,
    };
    this.modalContractLessonId = row.contractLessonId ?? null;
    this.modalClassId = row.classId;
    this.modalSubjectId = sid;
    this.modalLessonsPerWeek = row.lessonsPerWeek;
    this.modalLessonLength = row.isDoublePeriod === true ? 'double' : 'single';
    this.modalError = '';
    this.timetableService.getConfig().subscribe({
      next: (c) => {
        this.lessonsMap = { ...(c.lessonsPerWeek || {}) };
        this.lessonModalOpen = true;
        this.loadSubjectsForModalClass(this.modalClassId);
      },
      error: () => {
        this.lessonsMap = {};
        this.lessonModalOpen = true;
        this.loadSubjectsForModalClass(this.modalClassId);
      },
    });
  }

  closeLessonModal(): void {
    this.lessonModalOpen = false;
    this.modalSaving = false;
    this.modalError = '';
    this.modalSubjectHelp = '';
    this.editOriginal = null;
    this.modalContractLessonId = null;
  }

  onModalClassChange(): void {
    this.modalSubjectId = '';
    this.modalLessonsPerWeek = 3;
    this.modalLessonLength = 'single';
    this.modalSubjectHelp = '';
    this.loadSubjectsForModalClass(this.modalClassId);
  }

  onModalSubjectPicked(): void {
    if (!this.modalSubjectId) {
      return;
    }
    const v = this.lessonsMap[this.modalSubjectId];
    this.modalLessonsPerWeek = v != null && v >= 1 ? v : 3;
  }

  loadSubjectsForModalClass(classId: string): void {
    if (!classId) {
      this.modalSubjects = [];
      this.modalSubjectHelp = '';
      return;
    }
    this.loadingModalSubjects = true;
    this.modalSubjectHelp = '';
    const teacherAllowed = new Set(this.teacherSubjectsAllocated.map((s) => s.id));
    const metaById = new Map(this.teacherSubjectsAllocated.map((s) => [s.id, s]));
    this.classService.getClassById(classId).subscribe({
      next: (cls: any) => {
        const subs = (cls?.subjects || []) as Array<{
          id: string;
          name: string;
          code?: string | null;
          category?: string | null;
          shortTitle?: string | null;
        }>;
        const merged = subs
          .filter((s) => teacherAllowed.has(s.id))
          .map((s) => {
            const t = metaById.get(s.id);
            const codeRaw = s.code != null && String(s.code).trim() !== '' ? s.code : t?.code;
            const cat = s.category ?? t?.category;
            return {
              id: s.id,
              name: s.name,
              code: codeRaw ?? null,
              category: cat ?? null,
              shortTitle: t?.shortTitle ?? s.shortTitle ?? null,
            };
          })
          .sort(
            (a, b) =>
              String(a.code || '').localeCompare(String(b.code || '')) ||
              (a.name || '').localeCompare(b.name || '')
          );
        this.modalSubjects = merged;
        this.loadingModalSubjects = false;
        if (this.modalSubjectId && !this.modalSubjects.some((s) => s.id === this.modalSubjectId)) {
          this.modalSubjectId = '';
        }
        this.setModalSubjectHelp(subs.length, merged.length, teacherAllowed.size);
      },
      error: () => {
        this.modalSubjects = [];
        this.modalSubjectHelp = 'Could not load this class’s subjects.';
        this.loadingModalSubjects = false;
      },
    });
  }

  private setModalSubjectHelp(classSubjectCount: number, mergedCount: number, teacherSubjectCount: number): void {
    if (mergedCount > 0) {
      this.modalSubjectHelp = '';
      return;
    }
    if (teacherSubjectCount === 0) {
      this.modalSubjectHelp =
        'This teacher has no subjects assigned yet. Add subjects on the teacher’s profile first; only those subjects can be linked here.';
      return;
    }
    if (classSubjectCount === 0) {
      this.modalSubjectHelp = 'This class has no subjects on file. Add subjects to the class first.';
      return;
    }
    this.modalSubjectHelp =
      'No overlap: this class shares no subjects with this teacher’s assigned subjects. Assign the subject to this teacher and ensure the class offers it.';
  }

  private finalizeLessonSave(successMessage: string): void {
    this.modalSaving = false;
    this.closeLessonModal();
    this.selectedRow = null;
    this.success = successMessage;
    this.load();
    setTimeout(() => (this.success = ''), 5500);
  }

  saveLesson(): void {
    const tid = this.apiTeacherKey;
    if (!tid) {
      this.modalError = 'Teacher not loaded.';
      return;
    }
    if (!this.modalClassId || !this.modalSubjectId) {
      this.modalError = 'Select a class and a subject.';
      return;
    }

    this.modalSaving = true;
    this.modalError = '';

    const n = Number(this.modalLessonsPerWeek);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      this.modalSaving = false;
      this.modalError = 'Enter sessions per week between 1 and 50 (each counts ×1 or ×2 by period weight).';
      return;
    }

    if (this.lessonModalMode === 'new') {
      this.teacherService
        .assignTeacherClassSubject(
          tid,
          this.modalClassId,
          this.modalSubjectId,
          this.modalIsDoublePeriod,
          Math.round(n),
          null
        )
        .subscribe({
          next: () =>
            this.finalizeLessonSave(
              'New lesson line added. Other classes and lines are unchanged.'
            ),
          error: (err) => {
            this.modalSaving = false;
            this.modalError = err.error?.message || 'Could not add lesson.';
          },
        });
      return;
    }

    const old = this.editOriginal;
    if (!old) {
      this.modalSaving = false;
      return;
    }
    if (old.classId === this.modalClassId && old.subjectId === this.modalSubjectId) {
      this.teacherService
        .assignTeacherClassSubject(
          tid,
          this.modalClassId,
          this.modalSubjectId,
          this.modalIsDoublePeriod,
          Math.round(n),
          this.modalContractLessonId || old.contractLessonId || null
        )
        .subscribe({
          next: () =>
            this.finalizeLessonSave('Lesson line updated. Other classes are unchanged.'),
          error: (err) => {
            this.modalSaving = false;
            this.modalError = err.error?.message || 'Could not update lesson.';
          },
        });
      return;
    }

    const lineId = this.modalContractLessonId || old.contractLessonId || null;
    if (!lineId) {
      this.modalSaving = false;
      this.modalError = 'Cannot move this row: missing lesson line id. Remove it and add a new lesson.';
      return;
    }

    this.teacherService.unassignTeacherClassSubject(tid, undefined, undefined, lineId).subscribe({
      next: () => {
        this.teacherService
          .assignTeacherClassSubject(
            tid,
            this.modalClassId,
            this.modalSubjectId,
            this.modalIsDoublePeriod,
            Math.round(n),
            null
          )
          .subscribe({
            next: () => this.finalizeLessonSave('Lesson moved to the new class/subject.'),
            error: (err) => {
              this.modalSaving = false;
              this.modalError =
                err.error?.message ||
                'Previous line was removed but the new assignment failed. Use New lesson to add again.';
              this.load();
            },
          });
      },
      error: (err) => {
        this.modalSaving = false;
        this.modalError = err.error?.message || 'Could not update lesson.';
      },
    });
  }

  removeLesson(): void {
    if (!this.canEditOrRemove() || !this.selectedRow?.subjectId) {
      return;
    }
    const r = this.selectedRow;
    const subj = this.subjectCell(r);
    const cls = this.classCell(r);
    if (
      !confirm(
        `Remove this lesson?\n\n${subj} — ${cls}\n\nThis removes the class–subject link from this teacher’s load.`
      )
    ) {
      return;
    }
    const tid = this.apiTeacherKey;
    if (!tid) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.teacherService
      .unassignTeacherClassSubject(
        tid,
        r.classId,
        r.subjectId!,
        r.contractLessonId || null
      )
      .subscribe({
      next: () => {
        this.selectedRow = null;
        this.success = 'Lesson removed.';
        this.load();
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Could not remove lesson.';
      },
    });
  }
}
