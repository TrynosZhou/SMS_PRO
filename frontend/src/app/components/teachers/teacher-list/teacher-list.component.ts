import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { ClassService } from '../../../services/class.service';
import { DepartmentsService } from '../../../services/departments.service';
import { teachersManageNav } from '../teachers-manage-navigation';

/** Editable teacher fields from list / grid / modal (Staff / Employee ID is read-only). */
export type TeacherQuickEditField =
  | 'firstName'
  | 'lastName'
  | 'role'
  | 'gender'
  | 'maritalStatus'
  | 'phoneNumber'
  | 'address'
  | 'dateOfBirth'
  | 'qualification'
  | 'subjectIds'
  | 'classIds'
  | 'departmentId'
  | 'isActive';

@Component({
  selector: 'app-teacher-list',
  templateUrl: './teacher-list.component.html',
  styleUrls: ['./teacher-list.component.css']
})
export class TeacherListComponent implements OnInit {
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  allSubjects: any[] = [];
  allClasses: any[] = [];
  allDepartments: any[] = [];
  private departmentByName = new Map<string, any>();
  private hodByDepartmentId = new Map<string, any>();
  loading = false;
  searchQuery = '';
  selectedSubjectFilter = '';
  selectedClassFilter = '';
  viewMode: 'grid' | 'list' = 'list';
  selectedTeacher: any = null;
  error = '';
  success = '';
  pagination = {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [12, 24, 48, 100];
  private searchDebounceTimer: any = null;

  /** Quick field edit popup */
  fieldEditOpen = false;
  fieldEditTeacher: any = null;
  fieldEditKey: TeacherQuickEditField | '' = '';
  fieldEditLabel = '';
  fieldEditInputMode: 'text' | 'tel' | 'textarea' | 'select' | 'date' | 'multiselect' = 'text';
  fieldEditValue = '';
  fieldEditSelectOptions: { value: string; label: string }[] = [];
  fieldEditMultiIds: string[] = [];
  fieldEditCheckboxOptions: { id: string; label: string }[] = [];
  fieldEditSaving = false;
  /** When editing role: department chosen for HOD (required if role is HOD). */
  fieldEditHodDepartmentId = '';
  maxDobDate = '';
  private readonly phoneRegex = /^\+?\d{9,15}$/;
  readonly phoneValidationMessage = 'Enter a valid number, e.g. +263771234567 (9–15 digits, optional +).';

  constructor(
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private classService: ClassService,
    private departmentsService: DepartmentsService,
    private router: Router
  ) {
    const today = new Date();
    this.maxDobDate = today.toISOString().split('T')[0];
  }

  goToAssignClasses(teacher: any): void {
    if (!teacher?.id) return;
    this.router.navigateByUrl(
      teachersManageNav(this.router).allocateClass + `?teacherId=${encodeURIComponent(teacher.id)}`
    );
  }

  ngOnInit() {
    this.loadTeachers();
    this.loadSubjects();
    this.loadClasses();
    this.loadDepartments();
  }

  loadDepartments(): void {
    this.departmentsService.list().subscribe({
      next: (rows) => {
        this.allDepartments = (rows || []).filter((d: any) => d && d.isActive !== false);
        this.rebuildDepartmentIndexes();
      },
      error: () => (this.allDepartments = []),
    });
  }

  loadTeachers() {
    this.loading = true;
    this.teacherService.getTeachers({
      page: this.pagination.page,
      limit: this.pagination.limit,
      search: this.searchQuery || undefined
    }).subscribe({
      next: (data: any) => {
        if (Array.isArray(data)) {
          this.teachers = data;
          this.pagination.total = data.length;
          this.pagination.totalPages = 1;
        } else {
          this.teachers = data?.data || [];
          this.pagination.total = data?.total || this.teachers.length;
          this.pagination.totalPages = data?.totalPages || 1;
        }
        this.rebuildDepartmentIndexes();
        this.applyLocalFilters();
        this.syncSelectedTeacherFromLoaded();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading teachers:', err);
        this.loading = false;
        this.teachers = [];
        this.filteredTeachers = [];
        
        // Show user-friendly error message
        if (err.status === 0 || err.status === undefined) {
          console.error('Backend server is not running or not accessible. Please ensure the backend server is running on port 3001.');
        }
      }
    });
  }

  private normalizeDepartmentKey(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private isTeacherHodRole(t: any): boolean {
    return String(t?.role ?? '')
      .trim()
      .toLowerCase() === 'hod';
  }

  private rebuildDepartmentIndexes(): void {
    this.departmentByName.clear();
    this.hodByDepartmentId.clear();

    for (const d of this.allDepartments || []) {
      const key = this.normalizeDepartmentKey(d?.name);
      if (key) this.departmentByName.set(key, d);
    }

    for (const t of this.teachers || []) {
      if (!this.isTeacherHodRole(t)) continue;
      const depId = String(t?.departmentId || t?.department?.id || '').trim();
      if (depId) this.hodByDepartmentId.set(depId, t);
    }
  }

  getDerivedDepartmentMemberships(teacher: any): Array<{ department: any; hod: any | null }> {
    const out: Array<{ department: any; hod: any | null }> = [];
    const seen = new Set<string>();
    const subjects = Array.isArray(teacher?.subjects) ? teacher.subjects : [];

    for (const s of subjects) {
      const name = String(s?.name || '').trim();
      if (!name) continue;

      const key = this.normalizeDepartmentKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const mappedDepartment = this.departmentByName.get(key) || { id: '', name };
      const mappedHod = mappedDepartment?.id
        ? this.hodByDepartmentId.get(mappedDepartment.id) || null
        : null;
      out.push({ department: mappedDepartment, hod: mappedHod });
    }

    return out;
  }

  /**
   * Stored department (Settings) + HOD for that department; falls back to legacy subject-name matching.
   */
  getTeacherDepartmentRows(teacher: any): Array<{ department: any; hod: any | null }> {
    const depId = String(teacher?.departmentId || teacher?.department?.id || '').trim();
    if (depId) {
      const dept =
        teacher?.department ||
        this.allDepartments.find((d: any) => String(d?.id) === depId) ||
        { id: depId, name: '—' };
      let hod = this.hodByDepartmentId.get(depId) || null;
      if (!hod && this.isTeacherHodRole(teacher)) {
        hod = teacher;
      }
      return [{ department: dept, hod }];
    }
    const derived = this.getDerivedDepartmentMemberships(teacher);
    if (derived.length === 1 && this.isTeacherHodRole(teacher)) {
      const row = derived[0];
      return [{ department: row.department, hod: row.hod || teacher }];
    }
    return derived;
  }

  getHodLineLabel(teacher: any, hod: any | null): string {
    if (!hod) {
      return 'HOD not assigned';
    }
    if (teacher?.id && hod?.id && String(teacher.id) === String(hod.id)) {
      return 'Head of department (this teacher)';
    }
    return `HOD: ${this.getHodDisplayName(hod)}`;
  }

  getHodDisplayName(hod: any): string {
    if (!hod) return 'HOD not assigned';
    const full = `${hod?.lastName || ''} ${hod?.firstName || ''}`.trim();
    return full || hod?.teacherId || 'HOD assigned';
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data || [];
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        if (err.status === 0 || err.status === undefined) {
          console.error('Backend server is not running or not accessible.');
        }
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        this.allClasses = this.classService.sortClasses(classesList);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        if (err.status === 0 || err.status === undefined) {
          console.error('Backend server is not running or not accessible.');
        }
      }
    });
  }

  filterTeachers() {
    this.applyLocalFilters();
  }

  private applyLocalFilters() {
    let filtered = [...this.teachers];

    // Subject filter
    if (this.selectedSubjectFilter) {
      filtered = filtered.filter(teacher => {
        return teacher.subjects && teacher.subjects.some((s: any) => s.id === this.selectedSubjectFilter);
      });
    }

    // Class filter
    if (this.selectedClassFilter) {
      filtered = filtered.filter(teacher => {
        return teacher.classes && teacher.classes.some((c: any) => c.id === this.selectedClassFilter);
      });
    }

    this.filteredTeachers = filtered;
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedSubjectFilter = '';
    this.selectedClassFilter = '';
    this.pagination.page = 1;
    this.loadTeachers();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.selectedSubjectFilter || this.selectedClassFilter);
  }

  viewTeacherDetails(teacher: any) {
    this.selectedTeacher = teacher;
  }

  closeTeacherDetails() {
    this.closeFieldEdit();
    this.selectedTeacher = null;
  }

  openFieldEdit(teacher: any, field: TeacherQuickEditField, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!teacher?.id) {
      return;
    }
    this.error = '';
    this.fieldEditTeacher = teacher;
    this.fieldEditKey = field;
    this.fieldEditSelectOptions = [];
    this.fieldEditCheckboxOptions = [];
    this.fieldEditMultiIds = [];
    this.fieldEditInputMode = 'text';

    switch (field) {
      case 'firstName':
        this.fieldEditLabel = 'First name';
        this.fieldEditValue = (teacher.firstName || '').trim();
        break;
      case 'lastName':
        this.fieldEditLabel = 'Last name';
        this.fieldEditValue = (teacher.lastName || '').trim();
        break;
      case 'gender':
        this.fieldEditLabel = 'Gender';
        this.fieldEditInputMode = 'select';
        this.fieldEditSelectOptions = [
          { value: 'Male', label: 'Male' },
          { value: 'Female', label: 'Female' },
          { value: '', label: 'Not specified' }
        ];
        this.fieldEditValue = (teacher.gender || '').trim();
        break;
      case 'role':
        this.fieldEditLabel = 'Role & department (required for HOD)';
        this.fieldEditInputMode = 'select';
        this.fieldEditSelectOptions = [
          { value: 'Teacher', label: 'Teacher' },
          { value: 'HOD', label: 'HOD' }
        ];
        this.fieldEditValue = this.isTeacherHodRole(teacher) ? 'HOD' : 'Teacher';
        this.fieldEditHodDepartmentId = String(teacher.departmentId || teacher.department?.id || '').trim();
        break;
      case 'maritalStatus':
        this.fieldEditLabel = 'Marital status';
        this.fieldEditInputMode = 'select';
        if (this.isFemaleTeacher(teacher)) {
          this.fieldEditSelectOptions = [
            { value: '', label: '— Not set —' },
            { value: 'married', label: 'Married' },
            { value: 'single', label: 'Single' },
            { value: 'divorced', label: 'Divorced' },
            { value: 'widowed', label: 'Widowed' }
          ];
          const raw = (teacher.maritalStatus || '').trim().toLowerCase();
          this.fieldEditValue = ['married', 'single', 'divorced', 'widowed'].includes(raw) ? raw : '';
        } else if (this.isMaleTeacher(teacher)) {
          this.fieldEditSelectOptions = [
            { value: '', label: '— Not set —' },
            { value: 'married', label: 'Married' },
            { value: 'single', label: 'Single' },
            { value: 'divorced', label: 'Divorced' },
            { value: 'widower', label: 'Widower' }
          ];
          const raw = (teacher.maritalStatus || '').trim().toLowerCase();
          this.fieldEditValue = ['married', 'single', 'divorced', 'widower'].includes(raw) ? raw : '';
        } else {
          this.fieldEditSelectOptions = [{ value: '', label: '— Set gender first —' }];
          this.fieldEditValue = '';
        }
        break;
      case 'phoneNumber':
        this.fieldEditLabel = 'Phone number';
        this.fieldEditInputMode = 'tel';
        this.fieldEditValue = (teacher.phoneNumber || '').trim();
        break;
      case 'address':
        this.fieldEditLabel = 'Address';
        this.fieldEditInputMode = 'textarea';
        this.fieldEditValue = (teacher.address || '').trim();
        break;
      case 'dateOfBirth':
        this.fieldEditLabel = 'Date of birth';
        this.fieldEditInputMode = 'date';
        this.fieldEditValue = this.formatDateForInput(teacher.dateOfBirth);
        break;
      case 'qualification':
        this.fieldEditLabel = 'Qualification';
        this.fieldEditInputMode = 'textarea';
        this.fieldEditValue = (teacher.qualification || '').trim();
        break;
      case 'isActive':
        this.fieldEditLabel = 'Status';
        this.fieldEditInputMode = 'select';
        this.fieldEditSelectOptions = [
          { value: 'true', label: 'Active' },
          { value: 'false', label: 'Inactive' }
        ];
        this.fieldEditValue = teacher.isActive !== false ? 'true' : 'false';
        break;
      case 'subjectIds':
        this.fieldEditLabel = 'Teaching subjects';
        this.fieldEditInputMode = 'multiselect';
        this.fieldEditCheckboxOptions = [...this.allSubjects]
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .map((s: any) => ({ id: s.id, label: s.name }));
        this.fieldEditMultiIds = (teacher.subjects || []).map((s: any) => s.id);
        break;
      case 'classIds':
        this.fieldEditLabel = 'Assigned classes';
        this.fieldEditInputMode = 'multiselect';
        this.fieldEditCheckboxOptions = [...this.allClasses]
          .map((c: any) => ({ id: c.id, label: c.name }));
        this.fieldEditMultiIds = (teacher.classes || []).map((c: any) => c.id);
        break;
      case 'departmentId':
        this.fieldEditLabel = 'Department';
        this.fieldEditInputMode = 'select';
        this.fieldEditSelectOptions = [
          { value: '', label: '— None —' },
          ...[...this.allDepartments].map((d: any) => ({ value: d.id, label: d.name })),
        ];
        this.fieldEditValue = teacher.departmentId || teacher.department?.id || '';
        break;
      default:
        return;
    }
    this.fieldEditOpen = true;
  }

  closeFieldEdit() {
    this.fieldEditOpen = false;
    this.fieldEditTeacher = null;
    this.fieldEditKey = '';
    this.fieldEditValue = '';
    this.fieldEditHodDepartmentId = '';
    this.fieldEditMultiIds = [];
    this.fieldEditCheckboxOptions = [];
    this.fieldEditSaving = false;
  }

  toggleMultiId(id: string): void {
    const i = this.fieldEditMultiIds.indexOf(id);
    if (i >= 0) {
      this.fieldEditMultiIds.splice(i, 1);
    } else {
      this.fieldEditMultiIds.push(id);
    }
  }

  isMultiIdChecked(id: string): boolean {
    return this.fieldEditMultiIds.includes(id);
  }

  saveFieldEdit() {
    if (!this.fieldEditTeacher?.id || !this.fieldEditKey) {
      return;
    }
    const id = this.fieldEditTeacher.id;
    const field = this.fieldEditKey;

    if (field === 'classIds') {
      this.fieldEditSaving = true;
      this.error = '';
      this.teacherService.assignClassesToTeacher(id, [...this.fieldEditMultiIds]).subscribe({
        next: (res: any) => {
          this.fieldEditSaving = false;
          const updated = res?.teacher;
          if (updated) {
            this.applyTeacherPatch(updated);
          } else {
            this.loadTeachers();
          }
          this.closeFieldEdit();
          this.success = 'Teacher updated';
          setTimeout(() => (this.success = ''), 4000);
        },
        error: (err: any) => {
          this.fieldEditSaving = false;
          this.error = err.error?.message || err.message || 'Failed to update classes';
          setTimeout(() => (this.error = ''), 6000);
        }
      });
      return;
    }

    const payload: Record<string, unknown> = {};

    switch (field) {
      case 'firstName':
        if (!this.fieldEditValue.trim()) {
          this.error = 'First name is required';
          return;
        }
        payload['firstName'] = this.fieldEditValue.trim();
        break;
      case 'lastName':
        if (!this.fieldEditValue.trim()) {
          this.error = 'Last name is required';
          return;
        }
        payload['lastName'] = this.fieldEditValue.trim();
        break;
      case 'gender':
        payload['gender'] = this.fieldEditValue.trim() || null;
        break;
      case 'role': {
        const newRole = this.fieldEditValue === 'HOD' ? 'HOD' : 'Teacher';
        payload['role'] = newRole;
        if (newRole === 'HOD') {
          const depPick = String(this.fieldEditHodDepartmentId || '').trim();
          if (!depPick) {
            this.error = 'Select the department this HOD will lead (from Settings → Departments).';
            return;
          }
          payload['departmentId'] = depPick;
        }
        break;
      }
      case 'maritalStatus':
        payload['maritalStatus'] = this.fieldEditValue.trim() || null;
        break;
      case 'phoneNumber': {
        const trimmed = this.fieldEditValue.trim();
        if (!trimmed || !this.phoneRegex.test(trimmed)) {
          this.error = this.phoneValidationMessage;
          return;
        }
        payload['phoneNumber'] = trimmed;
        break;
      }
      case 'address':
        payload['address'] = this.fieldEditValue.trim() || null;
        break;
      case 'dateOfBirth':
        if (!this.fieldEditValue) {
          this.error = 'Date of birth is required';
          return;
        }
        payload['dateOfBirth'] = this.fieldEditValue;
        break;
      case 'qualification':
        payload['qualification'] = this.fieldEditValue.trim() || null;
        break;
      case 'isActive':
        payload['isActive'] = this.fieldEditValue === 'true';
        break;
      case 'subjectIds':
        payload['subjectIds'] = [...this.fieldEditMultiIds];
        break;
      case 'departmentId':
        payload['departmentId'] = this.fieldEditValue.trim() || null;
        break;
      default:
        return;
    }

    this.fieldEditSaving = true;
    this.error = '';
    this.teacherService.updateTeacher(id, payload).subscribe({
      next: (res: any) => {
        this.fieldEditSaving = false;
        const updated = res?.teacher;
        if (field === 'role') {
          this.loadTeachers();
        } else if (updated) {
          this.applyTeacherPatch(updated);
        } else {
          this.loadTeachers();
        }
        this.closeFieldEdit();
        this.success = 'Teacher updated';
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err: any) => {
        this.fieldEditSaving = false;
        this.error = err.error?.message || err.message || 'Failed to update';
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  private applyTeacherPatch(updated: any) {
    const uid = updated.id;
    this.filteredTeachers = this.filteredTeachers.map((t) => (t.id === uid ? { ...t, ...updated } : t));
    this.teachers = this.teachers.map((t) => (t.id === uid ? { ...t, ...updated } : t));
    if (this.selectedTeacher?.id === uid) {
      this.selectedTeacher = { ...this.selectedTeacher, ...updated };
    }
    this.syncSelectedTeacherFromLoaded();
  }

  /** Modal / detail view keeps an object reference; refresh it after list reload or patch. */
  private syncSelectedTeacherFromLoaded(): void {
    const sid = this.selectedTeacher?.id;
    if (!sid) return;
    const fresh =
      this.filteredTeachers.find((t) => t.id === sid) || this.teachers.find((t) => t.id === sid);
    if (fresh) {
      this.selectedTeacher = { ...fresh };
    }
  }

  private formatDateForInput(d: string | Date | null | undefined): string {
    if (!d) {
      return '';
    }
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) {
      return '';
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  editTeacher(id: string) {
    this.router.navigate(teachersManageNav(this.router).editSegments(id));
  }

  goToNewTeacher(): void {
    this.router.navigateByUrl(teachersManageNav(this.router).addNew);
  }

  getTotalSubjects(): number {
    const subjectSet = new Set();
    this.teachers.forEach(teacher => {
      if (teacher.subjects) {
        teacher.subjects.forEach((s: any) => subjectSet.add(s.id));
      }
    });
    return subjectSet.size;
  }

  getTotalClasses(): number {
    const classSet = new Set();
    this.teachers.forEach(teacher => {
      if (teacher.classes) {
        teacher.classes.forEach((c: any) => classSet.add(c.id));
      }
    });
    return classSet.size;
  }

  deleteTeacher(id: string, teacherName: string, teacherId: string) {
    if (!confirm(`Are you sure you want to delete teacher "${teacherName}" (${teacherId})? This action cannot be undone.`)) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.teacherService.deleteTeacher(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Teacher deleted successfully';
        this.loading = false;
        this.loadTeachers();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        if (err.status !== 400) {
          console.error('Error deleting teacher:', err);
        }
        let errorMessage = 'Failed to delete teacher';
        if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running.';
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        this.error = errorMessage;
        this.loading = false;
        setTimeout(() => {
          document.querySelector('.teachers-container .alert-error')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 0);
        setTimeout(() => this.error = '', 10000);
      }
    });
  }

  onSearchInput() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.pagination.page = 1;
      this.loadTeachers();
    }, 400);
  }

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.pagination.page = page;
    this.loadTeachers();
  }

  changePageSize(limit: string | number) {
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    if (!parsedLimit || parsedLimit === this.pagination.limit) return;
    this.pagination.limit = parsedLimit;
    this.pagination.page = 1;
    this.loadTeachers();
  }

  isTeacherActive(teacher: any): boolean {
    return teacher?.isActive !== false;
  }

  /** Modal avatar initials */
  getInitials(teacher: any): string {
    const f = (teacher?.firstName || '').trim().charAt(0).toUpperCase();
    const l = (teacher?.lastName || '').trim().charAt(0).toUpperCase();
    return (f + l).trim() || '?';
  }

  isFemaleTeacher(teacher: any): boolean {
    const g = (teacher?.gender || '').trim().toLowerCase();
    return g.startsWith('female');
  }

  isMaleTeacher(teacher: any): boolean {
    const g = (teacher?.gender || '').trim().toLowerCase();
    return g.startsWith('male');
  }

  /** Stored value → list/grid/modal label (female rows also drive Mrs/Miss/Ms on class timetables). */
  getMaritalStatusDisplay(teacher: any): string {
    if (!this.isFemaleTeacher(teacher) && !this.isMaleTeacher(teacher)) {
      return '—';
    }
    const m = String(teacher?.maritalStatus || '').trim().toLowerCase();
    const map: Record<string, string> = {
      married: 'Married',
      single: 'Single',
      divorced: 'Divorced',
      widowed: 'Widowed',
      widower: 'Widower'
    };
    if (map[m]) {
      return map[m];
    }
    return 'Not set';
  }
}
