import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';

export interface SubjectAssignmentTeacherSummary {
  id: string;
  teacherId: string;
  firstName: string;
  lastName: string;
  shortName: string;
  weeklyLessons: number;
  assignmentCount: number;
  assignedClassCount?: number;
  isActive: boolean;
}

@Component({
  selector: 'app-teacher-subject-assignment',
  templateUrl: './teacher-subject-assignment.component.html',
  styleUrls: ['./teacher-subject-assignment.component.css'],
})
export class TeacherSubjectAssignmentComponent implements OnInit {
  teachers: SubjectAssignmentTeacherSummary[] = [];
  filtered: SubjectAssignmentTeacherSummary[] = [];
  loading = false;
  error = '';
  success = '';
  searchQuery = '';
  selectedId: string | null = null;
  actionBusy = false;

  sortColumn: 'name' | 'lessons' | 'rows' | 'classes' | 'staffId' | 'status' = 'name';
  sortDir: 'asc' | 'desc' = 'asc';

  constructor(
    private teacherService: TeacherService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get selectedTeacher(): SubjectAssignmentTeacherSummary | null {
    if (!this.selectedId) {
      return null;
    }
    return this.teachers.find((t) => t.id === this.selectedId) || null;
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.teacherService.getSubjectAssignmentSummary().subscribe({
      next: (res) => {
        this.teachers = res?.teachers || [];
        this.applyFilterAndSort();
        if (this.selectedId && !this.teachers.some((t) => t.id === this.selectedId)) {
          this.selectedId = null;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to load teachers.';
        this.teachers = [];
        this.filtered = [];
        this.loading = false;
      },
    });
  }

  applyFilterAndSort(): void {
    const q = (this.searchQuery || '').trim().toLowerCase();
    let list: SubjectAssignmentTeacherSummary[];
    if (!q) {
      list = [...this.teachers];
    } else {
      list = this.teachers.filter((t) => {
        const name = `${t.firstName} ${t.lastName}`.toLowerCase();
        return (
          name.includes(q) ||
          (t.teacherId || '').toLowerCase().includes(q) ||
          (t.shortName || '').toLowerCase().includes(q)
        );
      });
    }

    const dir = this.sortDir === 'asc' ? 1 : -1;
    const cmpStr = (a: string, b: string) => dir * a.localeCompare(b, undefined, { sensitivity: 'base' });
    const cmpNum = (a: number, b: number) => dir * (a - b);

    list.sort((a, b) => {
      switch (this.sortColumn) {
        case 'lessons':
          return cmpNum(a.weeklyLessons || 0, b.weeklyLessons || 0) || cmpStr(this.displayName(a), this.displayName(b));
        case 'rows':
          return cmpNum(a.assignmentCount || 0, b.assignmentCount || 0) || cmpStr(this.displayName(a), this.displayName(b));
        case 'classes':
          return (
            cmpNum(a.assignedClassCount ?? -1, b.assignedClassCount ?? -1) ||
            cmpStr(this.displayName(a), this.displayName(b))
          );
        case 'staffId':
          return cmpStr(a.teacherId || '', b.teacherId || '');
        case 'status':
          return cmpNum(a.isActive ? 1 : 0, b.isActive ? 1 : 0) || cmpStr(this.displayName(a), this.displayName(b));
        case 'name':
        default:
          return cmpStr(this.displayName(a), this.displayName(b));
      }
    });

    this.filtered = list;
  }

  onSearchInput(): void {
    this.applyFilterAndSort();
  }

  sortBy(column: typeof this.sortColumn): void {
    if (this.sortColumn === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDir = column === 'lessons' || column === 'rows' || column === 'classes' ? 'desc' : 'asc';
    }
    this.applyFilterAndSort();
  }

  sortIndicator(column: typeof this.sortColumn): string {
    if (this.sortColumn !== column) {
      return '⇅';
    }
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  ariaSort(column: typeof this.sortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn !== column) {
      return 'none';
    }
    return this.sortDir === 'asc' ? 'ascending' : 'descending';
  }

  /** Sum of period-weighted lessons for rows currently shown. */
  lessonsTotalShown(): number {
    return this.filtered.reduce((s, t) => s + (Number(t.weeklyLessons) || 0), 0);
  }

  activeCountShown(): number {
    return this.filtered.filter((t) => t.isActive).length;
  }

  rowClass(t: SubjectAssignmentTeacherSummary): string {
    return this.selectedId === t.id ? 'tsa-row selected' : 'tsa-row';
  }

  selectRow(t: SubjectAssignmentTeacherSummary, ev?: Event): void {
    ev?.stopPropagation();
    this.selectedId = t.id;
  }

  openLessons(t: SubjectAssignmentTeacherSummary): void {
    this.router.navigate(['/teachers/manage', 'teacher_subject', 'contact', t.id]);
  }

  onNew(): void {
    this.router.navigate(['/teachers/manage', 'add-new']);
  }

  onEdit(): void {
    const t = this.selectedTeacher;
    if (!t?.id) {
      return;
    }
    this.router.navigate(['/teachers/manage', 'edit', t.id]);
  }

  onLessons(): void {
    const t = this.selectedTeacher;
    if (!t?.id) {
      return;
    }
    this.openLessons(t);
  }

  onRemove(): void {
    const t = this.selectedTeacher;
    if (!t?.id) {
      return;
    }
    const name = `${t.firstName || ''} ${t.lastName || ''}`.trim();
    if (
      !confirm(
        `Are you sure you want to delete teacher "${name}" (${t.teacherId})? This action cannot be undone.`
      )
    ) {
      return;
    }
    this.actionBusy = true;
    this.error = '';
    this.success = '';
    this.teacherService.deleteTeacher(t.id).subscribe({
      next: (data: any) => {
        this.success = data?.message || 'Teacher deleted successfully';
        this.selectedId = null;
        this.actionBusy = false;
        this.load();
        setTimeout(() => (this.success = ''), 5000);
      },
      error: (err: any) => {
        this.actionBusy = false;
        let msg = 'Failed to delete teacher';
        if (err.error?.message) {
          msg = err.error.message;
        } else if (typeof err.error === 'string') {
          msg = err.error;
        }
        this.error = msg;
      },
    });
  }

  displayName(t: SubjectAssignmentTeacherSummary): string {
    const raw = `${(t.firstName || '').trim()} ${(t.lastName || '').trim()}`.trim();
    return raw || '—';
  }

  actionsDisabled(): boolean {
    return !this.selectedTeacher || this.actionBusy || this.loading;
  }
}
