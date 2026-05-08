import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';

export type ClassScope = 'entire' | 'group1' | 'group2' | 'boys' | 'girls';

export const CLASS_SCOPE_OPTIONS: { value: ClassScope; label: string }[] = [
  { value: 'entire', label: 'Entire class' },
  { value: 'group1', label: 'Group 1' },
  { value: 'group2', label: 'Group 2' },
  { value: 'boys',   label: 'Boys' },
  { value: 'girls',  label: 'Girls' },
];

export interface ClassLessonRow {
  contractLessonId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  sessionsPerWeek: number;
  isDoublePeriod: boolean;
  lessonLength: number;
  classScope: ClassScope;
}

@Component({
  selector: 'app-class-subjects',
  templateUrl: './class-subjects.component.html',
  styleUrls: ['./class-subjects.component.css'],
})
export class ClassSubjectsComponent implements OnInit {
  classId = '';
  className = '';
  lessons: ClassLessonRow[] = [];
  teachers: any[] = [];
  subjects: any[] = [];

  selected: ClassLessonRow | null = null;
  loading = false;
  error = '';

  dialogOpen = false;
  editing: ClassLessonRow | null = null;

  formTeacherId = '';
  formSubjectId = '';
  formSessions = 1;
  formDouble = false;
  formClassScope: ClassScope = 'entire';
  saving = false;

  readonly scopeOptions = CLASS_SCOPE_OPTIONS;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private classService: ClassService,
    private teacherService: TeacherService,
    private subjectService: SubjectService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((pm) => {
      const id = pm.get('classId') || '';
      this.classId = id;
      if (id) {
        this.loadAll();
      }
    });
  }

  loadAll(): void {
    this.loading = true;
    this.error = '';
    this.classService.getClassContractLessons(this.classId).subscribe({
      next: (res: any) => {
        this.className = res?.className || '';
        this.lessons = res?.lessons || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || err?.message || 'Failed to load lessons.';
        this.loading = false;
        this.lessons = [];
      },
    });

    this.teacherService.getTeachers({ limit: 500 }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || data?.teachers || [];
        this.teachers = list;
      },
      error: () => {
        this.teachers = [];
      },
    });

    this.subjectService.getSubjects({ limit: 500 }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.subjects = list;
      },
      error: () => {
        this.subjects = [];
      },
    });
  }

  selectRow(row: ClassLessonRow): void {
    this.selected = row;
  }

  onRowDblClick(row: ClassLessonRow): void {
    this.openEdit(row);
  }

  close(): void {
    this.router.navigate(['/classes/manage/assign-teachers']);
  }

  newLesson(): void {
    this.editing = null;
    this.formTeacherId = this.teachers[0]?.id || '';
    this.formSubjectId = this.subjects[0]?.id || '';
    this.formSessions = 1;
    this.formDouble = false;
    this.formClassScope = 'entire';
    this.dialogOpen = true;
  }

  editLesson(): void {
    if (!this.selected) {
      return;
    }
    this.openEdit(this.selected);
  }

  openEdit(row: ClassLessonRow): void {
    this.editing = row;
    this.formTeacherId = row.teacherId;
    this.formSubjectId = row.subjectId;
    this.formSessions = row.sessionsPerWeek ?? 1;
    this.formDouble = row.isDoublePeriod === true;
    this.formClassScope = (row.classScope as ClassScope) || 'entire';
    this.dialogOpen = true;
  }

  closeDialog(): void {
    this.dialogOpen = false;
    this.editing = null;
  }

  removeLesson(): void {
    if (!this.selected) {
      return;
    }
    const line = this.selected;
    if (!confirm(`Remove lesson "${line.subjectName}" (${line.teacherName})?`)) {
      return;
    }
    this.teacherService
      .unassignTeacherClassSubject(line.teacherId, line.classId, line.subjectId, line.contractLessonId)
      .subscribe({
        next: () => this.loadAll(),
        error: (err: any) =>
          alert(err?.error?.message || err?.message || 'Could not remove lesson.'),
      });
  }

  saveDialog(): void {
    if (!this.formTeacherId || !this.formSubjectId) {
      alert('Choose a teacher and a subject.');
      return;
    }
    const spw = Math.min(50, Math.max(1, Math.round(Number(this.formSessions) || 1)));

    this.saving = true;
    const finish = () => {
      this.saving = false;
      this.closeDialog();
      this.loadAll();
    };
    const fail = (err: any) => {
      this.saving = false;
      alert(err?.error?.message || err?.message || 'Could not save lesson.');
    };

    if (this.editing) {
      const sameT = this.editing.teacherId === this.formTeacherId;
      const sameS = this.editing.subjectId === this.formSubjectId;
      if (sameT && sameS) {
        this.teacherService
          .assignTeacherClassSubject(
            this.formTeacherId,
            this.classId,
            this.formSubjectId,
            this.formDouble,
            spw,
            this.editing.contractLessonId,
            this.formClassScope
          )
          .subscribe({ next: finish, error: fail });
      } else {
        this.teacherService
          .unassignTeacherClassSubject(
            this.editing.teacherId,
            this.editing.classId,
            this.editing.subjectId,
            this.editing.contractLessonId
          )
          .subscribe({
            next: () => {
              this.teacherService
                .assignTeacherClassSubject(
                  this.formTeacherId,
                  this.classId,
                  this.formSubjectId,
                  this.formDouble,
                  spw,
                  null,
                  this.formClassScope
                )
                .subscribe({ next: finish, error: fail });
            },
            error: fail,
          });
      }
    } else {
      this.teacherService
        .assignTeacherClassSubject(
          this.formTeacherId,
          this.classId,
          this.formSubjectId,
          this.formDouble,
          spw,
          null,
          this.formClassScope
        )
        .subscribe({ next: finish, error: fail });
    }
  }

  classScopeLabel(scope: string): string {
    return CLASS_SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? 'Entire class';
  }

  subjectIconClass(name: string): string {
    const c = (name || '').charAt(0).toLowerCase();
    const hues: Record<string, string> = {
      e: 'si-e',
      g: 'si-g',
      m: 'si-m',
      h: 'si-h',
      p: 'si-p',
    };
    return hues[c] || 'si-o';
  }
}
