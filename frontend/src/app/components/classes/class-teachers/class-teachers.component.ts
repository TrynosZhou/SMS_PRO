import { Component, OnInit } from '@angular/core';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-class-teachers',
  templateUrl: './class-teachers.component.html',
  styleUrls: ['./class-teachers.component.css'],
})
export class ClassTeachersComponent implements OnInit {
  classes: any[] = [];
  teachers: any[] = [];
  loading = false;
  loadingTeachers = false;
  error: string | null = null;
  successMessage: string | null = null;
  private successMessageTimer: any = null;

  /** Currently open inline editor: the class being edited. */
  editingClass: any | null = null;
  /** Selected teacher id in the editor ('' represents "no class teacher"). */
  editingTeacherId = '';
  /** Search filter inside the editor's teacher list. */
  editingTeacherSearch = '';
  /** Save in progress flag for the editor. */
  saving = false;
  /** Per-modal error message (separate from the page-level error). */
  editorError: string | null = null;

  constructor(
    private classService: ClassService,
    private teacherService: TeacherService,
    private authService: AuthService,
  ) { }

  ngOnInit(): void {
    this.loadClasses();
    this.loadTeachers();
  }

  // ── Data loading ────────────────────────────────────────────────────────

  loadClasses(): void {
    this.loading = true;
    this.error = null;
    this.classService.getClasses({ limit: 500 }).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        this.classes = this.classService.sortClasses(list);
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to load classes';
        this.loading = false;
      },
    });
  }

  loadTeachers(): void {
    this.loadingTeachers = true;
    this.teacherService.getTeachers({ limit: 1000 }).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res) ? res : res?.data || res?.teachers || [];
        this.teachers = list
          .filter((t: any) => t && t.id)
          .sort((a: any, b: any) =>
            this.teacherLabel(a).localeCompare(this.teacherLabel(b), undefined, { sensitivity: 'base' })
          );
        this.loadingTeachers = false;
      },
      error: (err: any) => {
        console.error('Failed to load teachers list:', err);
        this.teachers = [];
        this.loadingTeachers = false;
      },
    });
  }

  // ── Permissions ─────────────────────────────────────────────────────────

  /** Admins/superadmins (and demo accounts) may edit the home/class teacher from this screen. */
  canEdit(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('demo_user')
    );
  }

  // ── Display helpers ─────────────────────────────────────────────────────

  teacherLabel(t: any): string {
    if (!t) {
      return '';
    }
    const fn = t.firstName ?? t.user?.firstName ?? '';
    const ln = t.lastName ?? t.user?.lastName ?? '';
    const name = `${fn} ${ln}`.trim();
    return name || t.email || t.user?.email || '—';
  }

  classTeacherLabel(c: any): string {
    if (!c) return '';
    if (c.classTeacher) return this.teacherLabel(c.classTeacher);
    const id = c.classTeacherId;
    if (id) {
      const t = this.teachers.find((x) => x.id === id);
      if (t) return this.teacherLabel(t);
    }
    return '';
  }

  /** Other teachers (timetabled) on this class — kept as secondary information. */
  otherTeachersForClass(c: any): any[] {
    const arr: any[] = Array.isArray(c?.teachers) ? c.teachers : [];
    const classTeacherId = c?.classTeacherId || c?.classTeacher?.id || '';
    return arr.filter((t) => t && t.id !== classTeacherId);
  }

  // ── Editor lifecycle ────────────────────────────────────────────────────

  openEditor(c: any): void {
    if (!this.canEdit()) return;
    this.editingClass = c;
    this.editingTeacherId = c?.classTeacherId || c?.classTeacher?.id || '';
    this.editingTeacherSearch = '';
    this.editorError = null;
    this.saving = false;
  }

  closeEditor(): void {
    if (this.saving) return;
    this.editingClass = null;
    this.editingTeacherId = '';
    this.editingTeacherSearch = '';
    this.editorError = null;
  }

  /** Filter teachers in the editor by typed query. */
  get filteredTeachers(): any[] {
    const q = this.editingTeacherSearch.trim().toLowerCase();
    if (!q) return this.teachers;
    return this.teachers.filter((t) => this.teacherLabel(t).toLowerCase().includes(q));
  }

  selectTeacher(teacherId: string): void {
    this.editingTeacherId = teacherId;
  }

  clearTeacherSelection(): void {
    this.editingTeacherId = '';
  }

  isSelected(teacherId: string): boolean {
    return this.editingTeacherId === teacherId;
  }

  /** Label for the currently selected teacher id inside the editor. */
  selectedEditingTeacherLabel(): string {
    if (!this.editingTeacherId) return '';
    const t = this.teachers.find((x) => x.id === this.editingTeacherId);
    return t ? this.teacherLabel(t) : '';
  }

  saveClassTeacher(): void {
    if (!this.editingClass || this.saving) return;
    if (!this.canEdit()) {
      this.editorError = 'You do not have permission to change the class teacher.';
      return;
    }

    const targetClass = this.editingClass;
    const previousId = targetClass.classTeacherId || targetClass.classTeacher?.id || '';
    const nextId = this.editingTeacherId || null;

    if ((previousId || '') === (nextId || '')) {
      this.closeEditor();
      return;
    }

    this.saving = true;
    this.editorError = null;
    this.classService.updateClassTeacher(targetClass.id, nextId).subscribe({
      next: (resp: any) => {
        const updated = resp?.class || null;
        // Reflect the change locally so we don't need a full reload.
        if (updated) {
          targetClass.classTeacher = updated.classTeacher || null;
          targetClass.classTeacherId = updated.classTeacherId || null;
          targetClass.teachers = Array.isArray(updated.teachers) ? updated.teachers : targetClass.teachers;
        } else {
          targetClass.classTeacherId = nextId;
          targetClass.classTeacher = nextId ? this.teachers.find((t) => t.id === nextId) || null : null;
          if (nextId && Array.isArray(targetClass.teachers) && !targetClass.teachers.some((t: any) => t?.id === nextId)) {
            const promoted = this.teachers.find((t) => t.id === nextId);
            if (promoted) targetClass.teachers = [...targetClass.teachers, promoted];
          }
        }
        this.saving = false;
        this.showSuccess(
          nextId
            ? `Class teacher updated for ${targetClass.name}.`
            : `Class teacher removed for ${targetClass.name}.`
        );
        this.closeEditor();
      },
      error: (err: any) => {
        console.error('Failed to update class teacher:', err);
        this.editorError = err?.error?.message || err?.message || 'Failed to update class teacher.';
        this.saving = false;
      },
    });
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    if (this.successMessageTimer) {
      clearTimeout(this.successMessageTimer);
    }
    this.successMessageTimer = setTimeout(() => {
      this.successMessage = null;
      this.successMessageTimer = null;
    }, 4000);
  }
}
