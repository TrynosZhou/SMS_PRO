import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { DepartmentsService } from '../../../services/departments.service';
import { SubjectService } from '../../../services/subject.service';

interface SubjectLite {
  id: string;
  name: string;
  code?: string | null;
  departmentId?: string | null;
}

interface DepartmentRow {
  id: string;
  name: string;
  isActive?: boolean;
  createdAt?: string;
  subjects?: SubjectLite[];
}

@Component({
  selector: 'app-academic-departments',
  templateUrl: './academic-departments.component.html',
  styleUrls: ['./academic-departments.component.css'],
})
export class AcademicDepartmentsComponent implements OnInit {
  departments: DepartmentRow[] = [];
  filteredDepartments: DepartmentRow[] = [];
  searchQuery = '';
  loading = false;

  /** All active subjects, used by the assign-subjects modal. */
  allSubjects: SubjectLite[] = [];

  // Add modal
  showAddModal = false;
  submitting = false;
  submitted = false;
  errorMsg = '';
  newDepartment = { name: '' };

  // Edit modal
  showEditModal = false;
  editSubmitting = false;
  editSubmitted = false;
  editErrorMsg = '';
  editDepartment: { id: string; name: string; isActive: boolean } = {
    id: '',
    name: '',
    isActive: true,
  };

  // Assign subjects modal
  showAssignModal = false;
  assigningDept: DepartmentRow | null = null;
  assignSubjectSearch = '';
  /** subjectId -> checked */
  private assignSelection: Record<string, boolean> = {};
  assignSubmitting = false;
  assignErrorMsg = '';
  assignSuccessMsg = '';

  constructor(
    private departmentsService: DepartmentsService,
    private subjectService: SubjectService
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  // ── Data loading ─────────────────────────────────
  loadAll(): void {
    this.loading = true;
    forkJoin({
      departments: this.departmentsService.list(),
      subjects: this.subjectService.getSubjects(),
    }).subscribe({
      next: ({ departments, subjects }) => {
        this.departments = Array.isArray(departments)
          ? (departments as DepartmentRow[])
          : ((departments as any)?.data || []);
        const raw = Array.isArray(subjects) ? subjects : (subjects as any)?.data || [];
        this.allSubjects = (raw || [])
          .filter((s: any) => s && s.isActive !== false)
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            code: s.code ?? null,
            departmentId: s.departmentId ?? null,
          }))
          .sort((a: SubjectLite, b: SubjectLite) =>
            String(a.name || '').localeCompare(String(b.name || ''))
          );
        this.applyFilter();
        this.loading = false;
      },
      error: () => {
        this.departments = [];
        this.filteredDepartments = [];
        this.allSubjects = [];
        this.loading = false;
      },
    });
  }

  /** Convenience reload alias (kept for old call sites). */
  loadDepartments(): void {
    this.loadAll();
  }

  applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredDepartments = q
      ? this.departments.filter((d) => (d.name || '').toLowerCase().includes(q))
      : [...this.departments];
  }

  // ── Add ──────────────────────────────────────────
  openAddModal(): void {
    this.newDepartment = { name: '' };
    this.submitted = false;
    this.errorMsg = '';
    this.showAddModal = true;
  }

  closeAddModal(): void {
    this.showAddModal = false;
    this.errorMsg = '';
  }

  saveDepartment(): void {
    this.submitted = true;
    const name = String(this.newDepartment.name || '').trim();
    if (!name) {
      this.errorMsg = 'Department name is required.';
      return;
    }
    this.submitting = true;
    this.errorMsg = '';
    this.departmentsService.create({ name }).subscribe({
      next: () => {
        this.submitting = false;
        this.closeAddModal();
        this.loadAll();
      },
      error: (err: any) => {
        this.submitting = false;
        this.errorMsg = err?.error?.message || 'Failed to save department.';
      },
    });
  }

  // ── Edit ─────────────────────────────────────────
  openEditModal(dep: DepartmentRow, event?: Event): void {
    event?.stopPropagation();
    this.editDepartment = {
      id: dep.id,
      name: dep.name || '',
      isActive: dep.isActive !== false,
    };
    this.editSubmitted = false;
    this.editErrorMsg = '';
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editErrorMsg = '';
  }

  updateDepartment(): void {
    this.editSubmitted = true;
    const name = String(this.editDepartment.name || '').trim();
    if (!name) {
      this.editErrorMsg = 'Department name is required.';
      return;
    }
    this.editSubmitting = true;
    this.editErrorMsg = '';
    const { id } = this.editDepartment;
    this.departmentsService
      .update(id, { name, isActive: this.editDepartment.isActive })
      .subscribe({
        next: () => {
          this.editSubmitting = false;
          this.closeEditModal();
          this.loadAll();
        },
        error: (err: any) => {
          this.editSubmitting = false;
          this.editErrorMsg = err?.error?.message || 'Failed to update department.';
        },
      });
  }

  // ── Delete ───────────────────────────────────────
  deleteDepartment(id: string, name: string, event?: Event): void {
    event?.stopPropagation();
    if (!confirm(`Delete department "${name}"?`)) return;
    this.departmentsService.delete(id).subscribe({
      next: () => this.loadAll(),
      error: (err: any) => alert(err?.error?.message || 'Failed to delete department.'),
    });
  }

  // ── Assign subjects ──────────────────────────────
  openAssignModal(dep: DepartmentRow): void {
    if (!dep?.id) return;
    this.assigningDept = dep;
    this.assignSubjectSearch = '';
    this.assignErrorMsg = '';
    this.assignSuccessMsg = '';
    // Pre-check subjects currently belonging to this department.
    const assigned = new Set((dep.subjects || []).map((s) => s.id));
    const selection: Record<string, boolean> = {};
    for (const s of this.allSubjects) {
      selection[s.id] = assigned.has(s.id);
    }
    this.assignSelection = selection;
    this.showAssignModal = true;
  }

  closeAssignModal(): void {
    this.showAssignModal = false;
    this.assigningDept = null;
    this.assignErrorMsg = '';
    this.assignSubjectSearch = '';
  }

  /** Subjects visible in the modal list, filtered by the modal's search box. */
  get filteredAssignSubjects(): SubjectLite[] {
    const q = this.assignSubjectSearch.toLowerCase().trim();
    if (!q) return this.allSubjects;
    return this.allSubjects.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.code || '').toLowerCase().includes(q)
    );
  }

  isSubjectChecked(subjectId: string): boolean {
    return !!this.assignSelection[subjectId];
  }

  toggleAssignSubject(subjectId: string, checked: boolean): void {
    this.assignSelection = { ...this.assignSelection, [subjectId]: !!checked };
  }

  /** Returns the name of the department this subject currently belongs to,
   *  or null if it is not assigned anywhere yet (or belongs to the dept we are editing). */
  otherDepartmentNameFor(subject: SubjectLite): string | null {
    const currentDeptId = this.assigningDept?.id || null;
    if (!subject.departmentId || subject.departmentId === currentDeptId) return null;
    const dep = this.departments.find((d) => d.id === subject.departmentId);
    return dep?.name || null;
  }

  selectedAssignCount(): number {
    return Object.values(this.assignSelection).filter(Boolean).length;
  }

  saveAssignments(): void {
    if (!this.assigningDept?.id) return;
    const ids = this.allSubjects
      .filter((s) => this.assignSelection[s.id])
      .map((s) => s.id);

    this.assignSubmitting = true;
    this.assignErrorMsg = '';
    this.assignSuccessMsg = '';
    this.departmentsService
      .setDepartmentSubjects(this.assigningDept.id, ids)
      .subscribe({
        next: () => {
          this.assignSubmitting = false;
          this.assignSuccessMsg = `Subjects saved for "${this.assigningDept?.name}".`;
          // Refresh data so chips / per-department lists update; keep modal closed.
          this.closeAssignModal();
          this.loadAll();
        },
        error: (err: any) => {
          this.assignSubmitting = false;
          this.assignErrorMsg =
            err?.error?.message || 'Failed to assign subjects to this department.';
        },
      });
  }

  trackById(_idx: number, row: { id: string }): string {
    return row?.id;
  }
}
