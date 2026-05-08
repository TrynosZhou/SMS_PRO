import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';

@Component({
  selector: 'app-assign-subject',
  templateUrl: './assign-subject.component.html',
  styleUrls: ['./assign-subject.component.css'],
})
export class AssignSubjectComponent implements OnInit {
  classes: any[] = [];
  subjects: any[] = [];
  selectedClassId = '';
  /** Subject ids assigned to the selected class (working copy). */
  assignedSubjectIds = new Set<string>();
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;
  subjectSearch = '';

  constructor(
    private classService: ClassService,
    private subjectService: SubjectService
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = null;
    forkJoin({
      classes: this.classService.getClasses({ limit: 500 }),
      subjects: this.subjectService.getSubjects({ limit: 500 }),
    }).subscribe({
      next: ({ classes, subjects }) => {
        const classList = Array.isArray(classes) ? classes : classes?.data || [];
        this.classes = this.classService.sortClasses(classList);
        const subjList = Array.isArray(subjects) ? subjects : subjects?.data || [];
        this.subjects = subjList
          .filter((s: any) => s.isActive !== false)
          .sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
          );
        this.loading = false;
        if (this.selectedClassId) {
          this.syncSelectionFromClass();
        }
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to load classes or subjects';
        this.loading = false;
      },
    });
  }

  onClassChange(): void {
    this.success = null;
    this.error = null;
    this.syncSelectionFromClass();
  }

  private syncSelectionFromClass(): void {
    this.assignedSubjectIds = new Set<string>();
    if (!this.selectedClassId) {
      return;
    }
    const cls = this.classes.find((c) => c.id === this.selectedClassId);
    const linked = cls?.subjects;
    if (Array.isArray(linked)) {
      linked.forEach((s: any) => {
        if (s?.id) {
          this.assignedSubjectIds.add(s.id);
        }
      });
    }
  }

  get filteredSubjects(): any[] {
    const q = this.subjectSearch.trim().toLowerCase();
    if (!q) {
      return this.subjects;
    }
    return this.subjects.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.code || '').toLowerCase().includes(q)
    );
  }

  isChecked(subjectId: string): boolean {
    return this.assignedSubjectIds.has(subjectId);
  }

  toggleSubject(subjectId: string): void {
    if (this.assignedSubjectIds.has(subjectId)) {
      this.assignedSubjectIds.delete(subjectId);
    } else {
      this.assignedSubjectIds.add(subjectId);
    }
    this.assignedSubjectIds = new Set(this.assignedSubjectIds);
  }

  saveAssignments(): void {
    if (!this.selectedClassId) {
      this.error = 'Please select a class first.';
      return;
    }
    this.saving = true;
    this.error = null;
    this.success = null;
    const subjectIds = Array.from(this.assignedSubjectIds);
    this.classService.updateClass(this.selectedClassId, { subjectIds }).subscribe({
      next: (res) => {
        const updated = res?.class;
        if (updated) {
          const idx = this.classes.findIndex((c) => c.id === updated.id);
          if (idx >= 0) {
            this.classes[idx] = updated;
          }
        }
        this.success = 'Subject assignments saved for this class.';
        this.saving = false;
        setTimeout(() => (this.success = null), 4000);
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to save subject assignments';
        this.saving = false;
      },
    });
  }

  get selectedClassName(): string {
    const c = this.classes.find((x) => x.id === this.selectedClassId);
    return c?.name || '';
  }
}
