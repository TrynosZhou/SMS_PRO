import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { SubjectUtilsService } from '../../../services/subject-utils.service';
import { DepartmentsService } from '../../../services/departments.service';
import { NgModel } from '@angular/forms';
import { teachersManageNav } from '../teachers-manage-navigation';

@Component({
  selector: 'app-teacher-form',
  templateUrl: './teacher-form.component.html',
  styleUrls: ['./teacher-form.component.css']
})
export class TeacherFormComponent implements OnInit {
  teacher: any = {
    firstName: '',
    lastName: '',
    role: 'Teacher',
    departmentId: '',
    gender: '',
    maritalStatus: '',
    phoneNumber: '',
    address: '',
    dateOfBirth: '',
    qualification: '',
    subjectIds: []
  };
  departments: any[] = [];
  availableSubjects: any[] = [];
  subjectSearchQuery = '';
  filteredSubjects: any[] = [];
  isEdit = false;
  error = '';
  success = '';
  submitting = false;
  maxDate = '';
  readonly phoneValidationMessage = 'Please enter a valid contact number, e.g. +263771234567.';
  private readonly phoneRegex = /^\+?\d{9,15}$/;

  constructor(
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private subjectUtils: SubjectUtilsService,
    private departmentsService: DepartmentsService,
    private route: ActivatedRoute,
    public router: Router
  ) {
    // Set max date to today (for date of birth)
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];
  }

  ngOnInit() {
    this.loadSubjects();
    this.loadDepartments();
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadTeacher(id);
    }
  }

  loadDepartments() {
    this.departmentsService.list().subscribe({
      next: (rows: any) => {
        this.departments = (rows || []).filter((d: any) => d && d.isActive !== false);
      },
      error: () => (this.departments = []),
    });
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        // Get unique subject names (group by name to avoid duplicates)
        const subjectMap = new Map<string, any>();
        (data || []).forEach((subject: any) => {
          if (!subjectMap.has(subject.name)) {
            subjectMap.set(subject.name, {
              id: subject.id,
              name: subject.name
            });
          }
        });
        this.availableSubjects = Array.from(subjectMap.values()).sort((a, b) => 
          a.name.localeCompare(b.name)
        );
        this.filteredSubjects = [...this.availableSubjects];
        this.error = ''; // Clear any previous errors
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        // Only show error if it's not a connection refused (might be temporary)
        if (err.status !== 0 && err.status !== undefined) {
          this.error = 'Failed to load subjects. Please refresh the page.';
        } else {
          // Connection refused - likely server restarting, retry after a delay
          setTimeout(() => {
            this.loadSubjects();
          }, 2000);
        }
      }
    });
  }

  filterSubjects() {
    if (!this.subjectSearchQuery.trim()) {
      this.filteredSubjects = [...this.availableSubjects];
      return;
    }
    const query = this.subjectSearchQuery.toLowerCase();
    this.filteredSubjects = this.availableSubjects.filter(subject =>
      subject.name.toLowerCase().includes(query)
    );
  }

  toggleSubject(subjectId: string) {
    const index = this.teacher.subjectIds.indexOf(subjectId);
    if (index > -1) {
      this.teacher.subjectIds.splice(index, 1);
    } else {
      this.teacher.subjectIds.push(subjectId);
    }
  }

  isSubjectSelected(subjectId: string): boolean {
    return this.teacher.subjectIds.includes(subjectId);
  }

  loadTeacher(id: string) {
    this.teacherService.getTeacherById(id).subscribe({
      next: (data: any) => {
        this.teacher = {
          ...data,
          role: data.role || 'Teacher',
          departmentId: data.departmentId || data.department?.id || '',
          dateOfBirth: data.dateOfBirth?.split('T')[0],
          subjectIds: data.subjects?.map((s: any) => s.id) || [],
          phoneNumber: data.phoneNumber || '',
          maritalStatus: data.maritalStatus || ''
        };
      },
      error: (err: any) => {
        this.error = 'Failed to load teacher';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  private calculateAge(dateString: string): number {
    const dob = new Date(dateString);
    if (isNaN(dob.getTime())) {
      return 0;
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  getPhoneNumberError(control: NgModel): string {
    if (!control || !control.errors) {
      return this.phoneValidationMessage;
    }
    if (control.errors['required']) {
      return 'Contact number is required.';
    }
    if (control.errors['minlength'] || control.errors['maxlength']) {
      return 'Contact number must be between 9 and 15 digits.';
    }
    if (control.errors['pattern']) {
      return this.phoneValidationMessage;
    }
    return this.phoneValidationMessage;
  }

  private isPhoneNumberValid(value: string): boolean {
    return this.phoneRegex.test(value.trim());
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.submitting = true;

    // Validate required fields
    if (!this.teacher.firstName || !this.teacher.lastName || !this.teacher.dateOfBirth) {
      this.error = 'Please fill in all required fields';
      this.submitting = false;
      return;
    }

    if (!this.teacher.phoneNumber || !this.isPhoneNumberValid(this.teacher.phoneNumber)) {
      this.error = this.phoneValidationMessage;
      this.submitting = false;
      return;
    }
    this.teacher.phoneNumber = this.teacher.phoneNumber.trim();

    const age = this.calculateAge(this.teacher.dateOfBirth);
    if (age < 20 || age > 65) {
      this.error = 'Teacher age must be between 20 and 65 years';
      this.submitting = false;
      return;
    }

    if (!String(this.teacher?.departmentId || '').trim()) {
      this.error = 'Please select a department (from Settings → Departments).';
      this.submitting = false;
      return;
    }

    if (this.isEdit) {
      // Don't send teacherId in update (it cannot be changed). Omit nested entities so the API
      // always receives an explicit scalar `role` (demotion HOD → Teacher was not persisting when
      // large spread objects were sent).
      const updateData: Record<string, unknown> = { ...this.teacher };
      delete updateData['teacherId'];
      delete updateData['id'];
      delete updateData['user'];
      delete updateData['subjects'];
      delete updateData['classes'];
      delete updateData['department'];
      updateData['role'] =
        String(this.teacher?.role ?? '')
          .trim()
          .toLowerCase() === 'hod'
          ? 'HOD'
          : 'Teacher';
      const dep =
        String(this.teacher?.departmentId ?? '').trim() ||
        String(this.teacher?.department?.id ?? '').trim();
      updateData['departmentId'] = dep || null;

      this.teacherService.updateTeacher(this.teacher.id, updateData).subscribe({
        next: () => {
          this.success = 'Teacher updated successfully';
          this.submitting = false;
          setTimeout(() => this.goToTeachersList(), 1500);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to update teacher';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      // For new teachers, don't send teacherId (it will be auto-generated)
      const teacherData = { ...this.teacher };
      delete teacherData.teacherId; // Remove teacherId, it will be auto-generated
      delete teacherData.id;
      
      this.teacherService.createTeacher(teacherData).subscribe({
        next: (response: any) => {
          this.success = response.message || 'Teacher registered successfully';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/teachers']), 1500);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to register teacher';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }

  goToTeachersList(): void {
    this.router.navigateByUrl(teachersManageNav(this.router).list);
  }

  get isTeacherFemale(): boolean {
    return (this.teacher?.gender || '').trim().toLowerCase().startsWith('female');
  }

  get isTeacherMale(): boolean {
    return (this.teacher?.gender || '').trim().toLowerCase().startsWith('male');
  }
}
