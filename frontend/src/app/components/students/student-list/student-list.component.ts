import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';
import { studentsManageNav } from '../students-manage-navigation';

/** Editable student fields from list / modal (student ID is preview-only). */
export type StudentQuickEditField =
  | 'firstName'
  | 'lastName'
  | 'classId'
  | 'contactNumber'
  | 'studentType'
  | 'gender'
  | 'dateOfBirth'
  | 'address';

@Component({
  selector: 'app-student-list',
  templateUrl: './student-list.component.html',
  styleUrls: ['./student-list.component.css']
})
export class StudentListComponent implements OnInit {
  /** Backend origin for /uploads (must match API server, not a hardcoded port). */
  readonly serverBaseUrl = environment.serverBaseUrl;

  students: any[] = [];
  filteredStudents: any[] = [];
  classes: any[] = [];
  selectedClass = '';
  selectedType = '';
  selectedGender = '';
  searchQuery = '';
  viewMode: 'grid' | 'list' = 'list';
  loading = false;
  error = '';
  success = '';
  selectedStudent: any = null;
  pagination = {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [12, 24, 48, 100];
  private searchDebounceTimer: any = null;

  /** ID card PDF preview in modal */
  idCardPreviewOpen = false;
  idCardPreviewUrl: SafeResourceUrl | null = null;
  private idCardBlobUrl: string | null = null;

  /** Quick field edit popup */
  fieldEditOpen = false;
  fieldEditStudent: any = null;
  fieldEditKey: StudentQuickEditField | '' = '';
  fieldEditLabel = '';
  fieldEditInputMode: 'text' | 'tel' | 'textarea' | 'select' | 'date' = 'text';
  fieldEditValue: string = '';
  fieldEditSelectOptions: { value: string; label: string }[] = [];
  fieldEditSaving = false;

  /** Single hidden file input for passport photo uploads (per-row buttons trigger this). */
  @ViewChild('passportPhotoFile') passportPhotoFile?: ElementRef<HTMLInputElement>;
  private passportPhotoTarget: any = null;

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private authService: AuthService
  ) { }

  /** Same roles as student update + photo on the API (admin-type staff). */
  canUploadStudentPhoto(): boolean {
    const r = this.authService.getCurrentUser()?.role;
    return r === 'superadmin' || r === 'admin' || r === 'accountant' || r === 'demo_user';
  }

  openPassportPhotoPicker(student: any, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    if (!this.canUploadStudentPhoto() || !student?.id || this.loading) {
      return;
    }
    this.passportPhotoTarget = student;
    setTimeout(() => this.passportPhotoFile?.nativeElement?.click());
  }

  onPassportPhotoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const student = this.passportPhotoTarget;
    this.passportPhotoTarget = null;
    input.value = '';
    if (!file || !student?.id) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.error = 'Please choose an image file (JPG, PNG, etc.).';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    this.error = '';
    this.success = '';
    this.loading = true;
    this.studentService.updateStudent(student.id, {}, file).subscribe({
      next: (res: any) => {
        this.loading = false;
        const updated = res?.student;
        if (updated) {
          this.applyStudentPatch(updated);
        } else {
          this.loadStudents();
        }
        this.success = 'Passport photo updated';
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || err.message || 'Failed to upload photo';
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  ngOnInit() {
    this.loadClasses();
    this.loadStudents();
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        this.classes = this.classService.sortClasses(classesList);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  loadStudents() {
    this.loading = true;
    this.studentService.getStudents({
      classId: this.selectedClass || undefined,
      studentType: this.selectedType || undefined,
      gender: this.selectedGender || undefined,
      search: this.searchQuery || undefined,
      page: this.pagination.page,
      limit: this.pagination.limit
    }).subscribe({
      next: (response: any) => {
        if (Array.isArray(response)) {
          this.students = response;
          this.pagination.total = response.length;
          this.pagination.totalPages = 1;
        } else {
          this.students = response?.data || [];
          this.pagination.total = response?.total || this.students.length;
          this.pagination.totalPages = response?.totalPages || 1;
        }
        this.filteredStudents = this.students;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading students:', err);
        this.error = 'Failed to load students';
        this.loading = false;
        this.students = [];
        this.filteredStudents = [];
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  filterStudents() {
    this.pagination.page = 1;
    this.loadStudents();
  }

  onSearchInput() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.pagination.page = 1;
      this.loadStudents();
    }, 400);
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedClass = '';
    this.selectedType = '';
    this.selectedGender = '';
    this.pagination.page = 1;
    this.loadStudents();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.selectedClass || this.selectedType || this.selectedGender);
  }

  viewStudentDetails(student: any) {
    this.selectedStudent = student;
  }

  closeStudentDetails() {
    this.closeFieldEdit();
    this.closeIdCardPreview();
    this.selectedStudent = null;
  }

  editStudent(id: string) {
    this.router.navigate(studentsManageNav(this.router).editSegments(id));
  }

  goToNewStudent(): void {
    this.router.navigateByUrl(studentsManageNav(this.router).addNew);
  }

  viewReportCard(studentId: string) {
    this.router.navigate(['/report-cards'], { queryParams: { studentId } });
  }

  getClassName(student: any): string {
    if (student.classEntity?.name) return student.classEntity.name;
    if (student.class?.name) return student.class.name;
    return 'N/A';
  }

  /** Initials for avatar placeholder (no emoji) */
  getInitials(student: any): string {
    const f = (student?.firstName || '').trim().charAt(0).toUpperCase();
    const l = (student?.lastName || '').trim().charAt(0).toUpperCase();
    const s = (f + l).trim();
    return s || '?';
  }

  /** Opens PDF preview of student ID card in a modal (does not edit student ID). */
  openIdCardPreview(studentId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!studentId) {
      return;
    }
    this.closeIdCardPreview();
    this.loading = true;
    this.error = '';
    this.studentService.getStudentIdCard(studentId).subscribe({
      next: (blob: Blob) => {
        this.loading = false;
        this.idCardBlobUrl = window.URL.createObjectURL(blob);
        this.idCardPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.idCardBlobUrl);
        this.idCardPreviewOpen = true;
      },
      error: (err: any) => {
        this.loading = false;
        console.error('Error loading student ID card:', err);
        console.error('Error details:', {
          status: err.status,
          statusText: err.statusText,
          error: err.error,
          message: err.message
        });
        
        let errorMessage = 'Failed to load student ID card';
        
        // Handle different error types
        if (err.status === 403) {
          const errorObj = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
          errorMessage = errorObj?.message || 'You do not have permission to view this student\'s ID card. Please ensure you have the required role (Admin, Super Admin, Accountant, or Teacher).';
          
          // Add user role info if available
          if (errorObj?.userRole) {
            errorMessage += ` Your current role: ${errorObj.userRole}.`;
          }
        } else if (err.status === 404) {
          errorMessage = 'Student not found';
        } else if (err.status === 401) {
          errorMessage = 'Authentication required. Please log in again.';
        } else if (err.status === 0 || err.status === undefined) {
          errorMessage = `Cannot connect to server. Please ensure the backend is running (${environment.serverBaseUrl}).`;
        } else if (err.error) {
          if (typeof err.error === 'object' && err.error.message) {
            errorMessage = err.error.message;
          } else if (typeof err.error === 'string') {
            try {
              const parsed = JSON.parse(err.error);
              errorMessage = parsed.message || errorMessage;
            } catch (e) {
              errorMessage = err.error;
            }
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        setTimeout(() => {
          if (this.error === errorMessage) {
            this.error = '';
          }
        }, 7000);
      }
    });
  }

  closeIdCardPreview() {
    if (this.idCardBlobUrl) {
      window.URL.revokeObjectURL(this.idCardBlobUrl);
      this.idCardBlobUrl = null;
    }
    this.idCardPreviewUrl = null;
    this.idCardPreviewOpen = false;
  }

  openFieldEdit(student: any, field: StudentQuickEditField, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!student?.id) {
      return;
    }
    this.fieldEditStudent = student;
    this.fieldEditKey = field;
    this.fieldEditSelectOptions = [];
    this.fieldEditInputMode = 'text';

    switch (field) {
      case 'firstName':
        this.fieldEditLabel = 'First name';
        this.fieldEditValue = (student.firstName || '').trim();
        break;
      case 'lastName':
        this.fieldEditLabel = 'Last name';
        this.fieldEditValue = (student.lastName || '').trim();
        break;
      case 'classId':
        this.fieldEditLabel = 'Class';
        this.fieldEditInputMode = 'select';
        this.fieldEditSelectOptions = [
          { value: '', label: 'Not assigned' },
          ...this.classes.map((c) => ({ value: c.id, label: c.name }))
        ];
        this.fieldEditValue = student.classId || student.class?.id || student.classEntity?.id || '';
        break;
      case 'contactNumber':
        this.fieldEditLabel = 'Contact number';
        this.fieldEditInputMode = 'tel';
        this.fieldEditValue = (student.contactNumber || student.phoneNumber || '').trim();
        break;
      case 'studentType':
        this.fieldEditLabel = 'Student type';
        this.fieldEditInputMode = 'select';
        this.fieldEditSelectOptions = [
          { value: 'Day Scholar', label: 'Day Scholar' },
          { value: 'Boarder', label: 'Boarder' }
        ];
        this.fieldEditValue = student.studentType || 'Day Scholar';
        break;
      case 'gender':
        this.fieldEditLabel = 'Gender';
        this.fieldEditInputMode = 'select';
        this.fieldEditSelectOptions = [
          { value: 'Male', label: 'Male' },
          { value: 'Female', label: 'Female' }
        ];
        this.fieldEditValue = student.gender || 'Male';
        break;
      case 'dateOfBirth':
        this.fieldEditLabel = 'Date of birth';
        this.fieldEditInputMode = 'date';
        this.fieldEditValue = this.formatDateForInput(student.dateOfBirth);
        break;
      case 'address':
        this.fieldEditLabel = 'Address';
        this.fieldEditInputMode = 'textarea';
        this.fieldEditValue = (student.address || '').trim();
        break;
      default:
        return;
    }
    this.fieldEditOpen = true;
  }

  closeFieldEdit() {
    this.fieldEditOpen = false;
    this.fieldEditStudent = null;
    this.fieldEditKey = '';
    this.fieldEditValue = '';
    this.fieldEditSaving = false;
  }

  saveFieldEdit() {
    if (!this.fieldEditStudent?.id || !this.fieldEditKey) {
      return;
    }
    const id = this.fieldEditStudent.id;
    const payload: Record<string, unknown> = {};

    switch (this.fieldEditKey) {
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
      case 'classId':
        payload['classId'] = this.fieldEditValue ? this.fieldEditValue : null;
        break;
      case 'contactNumber':
        payload['contactNumber'] = this.fieldEditValue.trim() || null;
        payload['phoneNumber'] = this.fieldEditValue.trim() || null;
        break;
      case 'studentType':
        payload['studentType'] = this.fieldEditValue;
        break;
      case 'gender':
        payload['gender'] = this.fieldEditValue;
        break;
      case 'dateOfBirth':
        if (!this.fieldEditValue) {
          this.error = 'Date of birth is required';
          return;
        }
        payload['dateOfBirth'] = this.fieldEditValue;
        break;
      case 'address':
        payload['address'] = this.fieldEditValue.trim() || null;
        break;
      default:
        return;
    }

    this.fieldEditSaving = true;
    this.error = '';
    this.studentService.updateStudent(id, payload).subscribe({
      next: (res: any) => {
        this.fieldEditSaving = false;
        const updated = res?.student;
        if (updated) {
          this.applyStudentPatch(updated);
        } else {
          this.loadStudents();
        }
        this.closeFieldEdit();
        this.success = 'Student updated';
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err: any) => {
        this.fieldEditSaving = false;
        this.error = err.error?.message || err.message || 'Failed to update';
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  private applyStudentPatch(updated: any) {
    const id = updated.id;
    this.filteredStudents = this.filteredStudents.map((s) => (s.id === id ? { ...s, ...updated } : s));
    this.students = this.students.map((s) => (s.id === id ? { ...s, ...updated } : s));
    if (this.selectedStudent?.id === id) {
      this.selectedStudent = { ...this.selectedStudent, ...updated };
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

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.pagination.page = page;
    this.loadStudents();
  }

  changePageSize(limit: string | number) {
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    if (!parsedLimit || parsedLimit === this.pagination.limit) {
      return;
    }
    this.pagination.limit = parsedLimit;
    this.pagination.page = 1;
    this.loadStudents();
  }

  deleteStudent(id: string, studentName: string, studentNumber: string) {
    if (!confirm(`Are you sure you want to delete student "${studentName}" (${studentNumber})? This will also delete all marks, invoices, and associated user account. This action cannot be undone.`)) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentService.deleteStudent(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Student deleted successfully';
        this.loading = false;
        this.loadStudents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error deleting student:', err);
        let errorMessage = 'Failed to delete student';
        if (err.status === 0 || err.status === undefined) {
          errorMessage = `Cannot connect to server. Please ensure the backend is running (${environment.serverBaseUrl}).`;
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
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  getStudentsByClass(): any[] {
    const classSet = new Set();
    this.students.forEach(student => {
      if (student.classId || student.class?.id) {
        classSet.add(student.classId || student.class?.id);
      }
    });
    return Array.from(classSet);
  }

  getDayScholarsCount(): number {
    return this.students.filter(s => (s.studentType || 'Day Scholar') === 'Day Scholar').length;
  }

  getBoardersCount(): number {
    return this.students.filter(s => s.studentType === 'Boarder').length;
  }
}
