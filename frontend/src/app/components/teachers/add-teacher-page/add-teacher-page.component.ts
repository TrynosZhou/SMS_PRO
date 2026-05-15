import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
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
  selector: 'app-add-teacher-page',
  templateUrl: './add-teacher-page.component.html',
  styleUrls: ['./add-teacher-page.component.css'],
})
export class AddTeacherPageComponent implements OnInit {
  saving = false;
  error = '';
  submitted = false;
  maxDob = '';
  departments: Array<{ id: string; name: string }> = [];
  loadingDepartments = false;

  readonly phoneRegex = /^\+?\d{9,15}$/;
  readonly phoneValidationMessage =
    'Enter a valid number, e.g. +263771234567 (9–15 digits, optional +).';

  draft: NewTeacherDraft = this.buildEmptyDraft();

  constructor(
    private router: Router,
    private modalService: AddTeacherModalService,
    private teacherService: TeacherService,
    private departmentsService: DepartmentsService,
    private authService: AuthService
  ) {
    const today = new Date();
    this.maxDob = today.toISOString().split('T')[0];
  }

  ngOnInit(): void {
    this.draft = this.buildEmptyDraft();
    this.submitted = false;
    this.error = '';
    this.loadDepartments();
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
      },
    });
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
      qualifications: [''],
    };
  }

  cancel(): void {
    if (this.saving) return;
    void this.router.navigate(['/teachers']);
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

  readonly sectionSteps = [
    { id: 1, label: 'Personal', icon: '👤' },
    { id: 2, label: 'Employment', icon: '💼' },
    { id: 3, label: 'Contact', icon: '📞' },
    { id: 4, label: 'Qualifications', icon: '🎓' },
  ];

  getCompletionPercent(): number {
    const checks = [
      !!this.draft.title,
      !!this.draft.firstName?.trim(),
      !!this.draft.lastName?.trim(),
      !!this.draft.nationalId?.trim(),
      !!this.draft.dateOfBirth,
      !!this.draft.gender,
      !!this.draft.role,
      !!this.draft.departmentId,
      !!this.draft.dateOfJoining,
      !!this.draft.phoneNumber?.trim() && this.phoneRegex.test(this.draft.phoneNumber.trim()),
      !!this.draft.email?.trim() && this.isEmailLike(this.draft.email),
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }

  isSectionComplete(sectionId: number): boolean {
    const d = this.draft;
    switch (sectionId) {
      case 1:
        return !!(
          d.title &&
          d.firstName?.trim() &&
          d.lastName?.trim() &&
          d.nationalId?.trim() &&
          d.dateOfBirth &&
          d.gender
        );
      case 2:
        return !!(d.role && d.departmentId && d.dateOfJoining);
      case 3:
        return !!(
          d.phoneNumber?.trim() &&
          this.phoneRegex.test(d.phoneNumber.trim()) &&
          d.email?.trim() &&
          this.isEmailLike(d.email)
        );
      case 4:
        return (d.qualifications || []).some((q) => q.trim().length > 0);
      default:
        return false;
    }
  }

  getTeacherPreviewName(): string {
    const parts = [this.draft.title, this.draft.firstName?.trim(), this.draft.lastName?.trim()].filter(
      Boolean
    );
    return parts.length > 1 ? parts.join(' ') : '';
  }

  scrollToSection(sectionId: number): void {
    const el = document.getElementById(`tf-section-${sectionId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Highlights the first section that still needs required input. */
  isStepCurrent(sectionId: number): boolean {
    for (const s of this.sectionSteps) {
      if (!this.isSectionComplete(s.id)) {
        return s.id === sectionId;
      }
    }
    return sectionId === this.sectionSteps[this.sectionSteps.length - 1].id;
  }

  private isEmailLike(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  submit(): void {
    this.submitted = true;
    this.error = '';

    const t = this.draft;
    if (!t.title) {
      this.error = 'Title is required.';
      return;
    }
    if (!t.firstName?.trim()) {
      this.error = 'First name is required.';
      return;
    }
    if (!t.lastName?.trim()) {
      this.error = 'Surname is required.';
      return;
    }
    if (!t.nationalId?.trim()) {
      this.error = 'National ID is required.';
      return;
    }
    if (!t.dateOfBirth) {
      this.error = 'Date of Birth is required.';
      return;
    }
    if (!t.gender) {
      this.error = 'Gender is required.';
      return;
    }
    if (!t.role) {
      this.error = 'Role is required.';
      return;
    }
    if (!t.departmentId) {
      this.error = 'Department is required.';
      return;
    }
    if (!t.dateOfJoining) {
      this.error = 'Date of Joining is required.';
      return;
    }
    if (!t.phoneNumber?.trim() || !this.phoneRegex.test(t.phoneNumber.trim())) {
      this.error = this.phoneValidationMessage;
      return;
    }
    if (!t.email?.trim() || !this.isEmailLike(t.email)) {
      this.error = 'Please enter a valid email address.';
      return;
    }

    const qualifications = (t.qualifications || []).map((q) => q.trim()).filter(Boolean);

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
      qualification: qualifications.join('; '),
    };

    this.saving = true;
    this.teacherService.createTeacher(payload).subscribe({
      next: (resp: any) => {
        this.saving = false;
        this.modalService.emitCreated(resp || payload);
        void this.router.navigate(['/teachers']);
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err?.error?.message || err?.error || 'Failed to add teacher.';
      },
    });
  }
}
