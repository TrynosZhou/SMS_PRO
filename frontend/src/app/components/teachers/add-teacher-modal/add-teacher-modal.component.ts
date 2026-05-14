import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AddTeacherModalService } from '../../../services/add-teacher-modal.service';
import { TeacherService } from '../../../services/teacher.service';
import { DepartmentsService } from '../../../services/departments.service';
import { AuthService } from '../../../services/auth.service';

interface NewTeacherDraft {
  title: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  dateOfBirth: string;
  gender: string;
  role: string;
  departmentId: string;
  dateOfJoining: string;
  dateOfLeaving: string;
  isActive: boolean;
  phoneNumber: string;
  email: string;
  address: string;
  qualifications: string[];
}

@Component({
  selector: 'app-add-teacher-modal',
  templateUrl: './add-teacher-modal.component.html',
  styleUrls: ['./add-teacher-modal.component.css']
})
export class AddTeacherModalComponent implements OnInit, OnDestroy {
  visible = false;
  saving = false;
  error = '';
  submitted = false;
  maxDob = '';
  departments: Array<{ id: string; name: string }> = [];
  loadingDepartments = false;

  private readonly phoneRegex = /^\+?\d{9,15}$/;
  readonly phoneValidationMessage = 'Enter a valid number, e.g. +263771234567 (9–15 digits, optional +).';
  private sub?: Subscription;

  draft: NewTeacherDraft = this.buildEmptyDraft();

  constructor(
    private modalService: AddTeacherModalService,
    private teacherService: TeacherService,
    private departmentsService: DepartmentsService,
    private authService: AuthService
  ) {
    const today = new Date();
    this.maxDob = today.toISOString().split('T')[0];
  }

  ngOnInit(): void {
    // Do not load departments here: this modal is on app shell and runs before login.
    // Departments load when the modal opens (see visible$ subscription).
    this.sub = this.modalService.visible$.subscribe((open) => {
      if (open) {
        this.draft = this.buildEmptyDraft();
        this.submitted = false;
        this.error = '';
        this.visible = true;
        if (!this.departments.length) {
          this.loadDepartments();
        }
      } else {
        this.visible = false;
      }
    });
  }

  private loadDepartments(): void {
    if (!this.authService.isAuthenticated()) {
      this.departments = [];
      this.loadingDepartments = false;
      return;
    }
    this.loadingDepartments = true;
    this.departmentsService.list().subscribe({
      next: (rows: any) => {
        this.departments = (rows || [])
          .filter((d: any) => d && d.isActive !== false)
          .map((d: any) => ({ id: String(d.id), name: String(d.name || '') }));
        this.loadingDepartments = false;
      },
      error: () => {
        this.departments = [];
        this.loadingDepartments = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private buildEmptyDraft(): NewTeacherDraft {
    const today = new Date().toISOString().split('T')[0];
    return {
      title: '',
      firstName: '',
      lastName: '',
      nationalId: '',
      dateOfBirth: '',
      gender: '',
      role: 'Teacher',
      departmentId: '',
      dateOfJoining: today,
      dateOfLeaving: '',
      isActive: true,
      phoneNumber: '',
      email: '',
      address: '',
      qualifications: ['']
    };
  }

  close(): void {
    if (this.saving) return;
    this.modalService.close();
  }

  setGender(gender: 'Male' | 'Female'): void {
    this.draft.gender = gender;
  }

  setActive(active: boolean): void {
    this.draft.isActive = active;
  }

  addQualification(): void {
    this.draft.qualifications.push('');
  }

  removeQualification(index: number): void {
    if (this.draft.qualifications.length <= 1) {
      this.draft.qualifications[0] = '';
      return;
    }
    this.draft.qualifications.splice(index, 1);
  }

  trackByIndex(index: number): number {
    return index;
  }

  private isEmailLike(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  submit(): void {
    this.submitted = true;
    this.error = '';

    const t = this.draft;
    if (!t.title) { this.error = 'Title is required.'; return; }
    if (!t.firstName?.trim()) { this.error = 'First name is required.'; return; }
    if (!t.lastName?.trim()) { this.error = 'Surname is required.'; return; }
    if (!t.nationalId?.trim()) { this.error = 'National ID is required.'; return; }
    if (!t.dateOfBirth) { this.error = 'Date of Birth is required.'; return; }
    if (!t.role) { this.error = 'Role is required.'; return; }
    if (!t.departmentId) { this.error = 'Department is required.'; return; }
    if (!t.dateOfJoining) { this.error = 'Date of Joining is required.'; return; }
    if (!t.phoneNumber?.trim() || !this.phoneRegex.test(t.phoneNumber.trim())) {
      this.error = this.phoneValidationMessage;
      return;
    }
    if (!t.email?.trim() || !this.isEmailLike(t.email)) {
      this.error = 'Please enter a valid email address.';
      return;
    }

    const qualifications = (t.qualifications || []).map(q => q.trim()).filter(Boolean);

    const payload: any = {
      title: t.title,
      firstName: t.firstName.trim(),
      lastName: t.lastName.trim(),
      nationalId: t.nationalId.trim(),
      dateOfBirth: t.dateOfBirth,
      gender: t.gender || undefined,
      role: t.role,
      departmentId: t.departmentId || undefined,
      dateOfJoining: t.dateOfJoining,
      dateOfLeaving: t.dateOfLeaving || undefined,
      isActive: t.isActive,
      phoneNumber: t.phoneNumber.trim(),
      email: t.email.trim(),
      address: t.address?.trim() || undefined,
      qualifications,
      qualification: qualifications.join('; ')
    };

    this.saving = true;
    this.teacherService.createTeacher(payload).subscribe({
      next: (resp: any) => {
        this.saving = false;
        this.modalService.emitCreated(resp || payload);
        this.modalService.close();
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err?.error?.message || err?.error || 'Failed to add teacher.';
      }
    });
  }
}
