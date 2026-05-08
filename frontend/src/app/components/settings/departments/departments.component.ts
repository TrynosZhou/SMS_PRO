import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { DepartmentsService } from '../../../services/departments.service';
import { SubjectService } from '../../../services/subject.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-departments',
  templateUrl: './departments.component.html',
  styleUrls: ['./departments.component.css'],
})
export class DepartmentsComponent implements OnInit {
  departments: any[] = [];
  /** Active subjects for checkbox lists (same list under each department). */
  allSubjects: any[] = [];
  /** depId -> subjectId -> checked */
  private deptSubjectSelection: Record<string, Record<string, boolean>> = {};
  loading = false;
  savingDeptId: string | null = null;
  error = '';
  success = '';

  newName = '';

  constructor(
    private deps: DepartmentsService,
    private subjects: SubjectService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  canManage(): boolean {
    return this.auth.hasRole('admin') || this.auth.hasRole('superadmin');
  }

  private normalizeSubjectsResponse(data: any): any[] {
    if (Array.isArray(data)) return data;
    return data?.data || [];
  }

  load(): void {
    this.loading = true;
    this.error = '';
    forkJoin({
      departments: this.deps.list(),
      subjects: this.subjects.getSubjects(),
    }).subscribe({
      next: ({ departments, subjects }) => {
        this.departments = departments || [];
        const raw = this.normalizeSubjectsResponse(subjects);
        this.allSubjects = (raw || [])
          .filter((s: any) => s && s.isActive !== false)
          .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
        this.rebuildSelectionFromServer();
        this.loading = false;
      },
      error: (e) => {
        this.departments = [];
        this.allSubjects = [];
        this.deptSubjectSelection = {};
        this.loading = false;
        this.error = e?.error?.message || 'Failed to load departments';
      },
    });
  }

  private rebuildSelectionFromServer(): void {
    const next: Record<string, Record<string, boolean>> = {};
    for (const d of this.departments) {
      next[d.id] = {};
      for (const s of this.allSubjects) {
        const inDept = (d.subjects || []).some((x: any) => x.id === s.id);
        next[d.id][s.id] = inDept;
      }
    }
    this.deptSubjectSelection = next;
  }

  isSubjectInDepartment(depId: string, subjectId: string): boolean {
    return !!this.deptSubjectSelection[depId]?.[subjectId];
  }

  toggleSubject(depId: string, subjectId: string, checked: boolean): void {
    if (!this.canManage()) return;
    if (checked) {
      for (const d of this.departments) {
        if (d.id !== depId && this.deptSubjectSelection[d.id]?.[subjectId]) {
          this.deptSubjectSelection[d.id][subjectId] = false;
        }
      }
      if (!this.deptSubjectSelection[depId]) {
        this.deptSubjectSelection[depId] = {};
      }
      this.deptSubjectSelection[depId][subjectId] = true;
    } else {
      if (this.deptSubjectSelection[depId]) {
        this.deptSubjectSelection[depId][subjectId] = false;
      }
    }
    this.deptSubjectSelection = { ...this.deptSubjectSelection };
  }

  saveDepartmentSubjects(dep: any): void {
    if (!dep?.id || !this.canManage()) return;
    const ids = this.allSubjects.filter((s) => this.isSubjectInDepartment(dep.id, s.id)).map((s) => s.id);
    this.error = '';
    this.success = '';
    this.savingDeptId = dep.id;
    this.deps.setDepartmentSubjects(dep.id, ids).subscribe({
      next: () => {
        this.savingDeptId = null;
        this.success = `Subjects saved for “${dep.name}”.`;
        this.load();
      },
      error: (e) => {
        this.savingDeptId = null;
        this.error = e?.error?.message || 'Failed to save subjects';
      },
    });
  }

  add(): void {
    this.success = '';
    this.error = '';
    const name = String(this.newName || '').trim();
    if (!name) {
      this.error = 'Enter a department name.';
      return;
    }
    this.deps.create({ name }).subscribe({
      next: () => {
        this.newName = '';
        this.success = 'Department added.';
        this.load();
      },
      error: (e) => {
        this.error = e?.error?.message || 'Failed to add department';
      },
    });
  }

  toggleActive(dep: any): void {
    if (!dep?.id) return;
    this.success = '';
    this.error = '';
    const next = !Boolean(dep.isActive);
    this.deps.update(dep.id, { isActive: next }).subscribe({
      next: () => {
        dep.isActive = next;
        this.success = 'Updated.';
      },
      error: (e) => (this.error = e?.error?.message || 'Failed to update'),
    });
  }

  rename(dep: any, value: string): void {
    if (!dep?.id) return;
    const name = String(value || '').trim();
    if (!name) return;
    this.success = '';
    this.error = '';
    this.deps.update(dep.id, { name }).subscribe({
      next: (row) => {
        dep.name = row?.name || name;
        this.success = 'Updated.';
      },
      error: (e) => (this.error = e?.error?.message || 'Failed to update'),
    });
  }

  remove(dep: any): void {
    if (!dep?.id) return;
    this.success = '';
    this.error = '';
    if (!confirm(`Delete department "${dep.name}"?`)) return;
    this.deps.delete(dep.id).subscribe({
      next: () => {
        this.success = 'Deleted.';
        this.load();
      },
      error: (e) => (this.error = e?.error?.message || 'Failed to delete'),
    });
  }
}
