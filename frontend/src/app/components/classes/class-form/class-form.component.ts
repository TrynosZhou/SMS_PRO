import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClassService } from '../../../services/class.service';
import { navigateToClassesList } from '../classes-manage-navigation';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-class-form',
  templateUrl: './class-form.component.html',
  styleUrls: ['./class-form.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0, transform: 'translateY(-10px)' })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class ClassFormComponent implements OnInit {
  classItem: any = {
    name: '',
    form: '',
    description: '',
    isActive: true
  };
  isEdit = false;
  error = '';
  success = '';
  submitting = false;
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();
  
  // Teachers
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  selectedTeacherIds: string[] = [];
  /** Home teacher (classTeacherId); may be any registered teacher; submit merges into teacherIds. */
  selectedClassTeacherId = '';
  teacherSearchQuery = '';
  loadingTeachers = false;
  
  // Subjects
  subjects: any[] = [];
  filteredSubjects: any[] = [];
  selectedSubjectIds: string[] = [];
  subjectSearchQuery = '';
  loadingSubjects = false;
  
  // Form suggestions
  formSuggestions = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
  formSuggestionsId = 'formSuggestions';

  constructor(
    private classService: ClassService,
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private route: ActivatedRoute,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadClass(id);
    } else {
      // Load teachers and subjects for new class
      this.loadTeachers();
      this.loadSubjects();
    }
  }

  loadClass(id: string) {
    this.classService.getClassById(id).subscribe({
      next: (data: any) => {
        this.classItem = data;
        // Load selected teachers and subjects
        if (data.teachers) {
          this.selectedTeacherIds = data.teachers.map((t: any) => t.id);
        }
        this.selectedClassTeacherId =
          data.classTeacherId || data.classTeacher?.id || '';
        if (
          this.selectedClassTeacherId &&
          !this.selectedTeacherIds.includes(this.selectedClassTeacherId)
        ) {
          this.selectedTeacherIds.push(this.selectedClassTeacherId);
        }
        if (data.subjects) {
          this.selectedSubjectIds = data.subjects.map((s: any) => s.id);
        }
        // Load all teachers and subjects for selection
        this.loadTeachers();
        this.loadSubjects();
      },
      error: (err: any) => {
        this.error = 'Failed to load class';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadTeachers() {
    this.loadingTeachers = true;
    this.teacherService.getTeachers().subscribe({
      next: (data: any) => {
        this.teachers = (data || []).filter((t: any) => t.isActive !== false);
        this.filteredTeachers = [...this.teachers];
        this.loadingTeachers = false;
      },
      error: (err: any) => {
        console.error('Error loading teachers:', err);
        this.loadingTeachers = false;
      }
    });
  }

  loadSubjects() {
    this.loadingSubjects = true;
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.subjects = (data || []).filter((s: any) => s.isActive !== false);
        this.filteredSubjects = [...this.subjects];
        this.loadingSubjects = false;
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.loadingSubjects = false;
      }
    });
  }

  filterTeachers() {
    if (!this.teacherSearchQuery.trim()) {
      this.filteredTeachers = [...this.teachers];
      return;
    }
    const query = this.teacherSearchQuery.toLowerCase().trim();
    this.filteredTeachers = this.teachers.filter(teacher => {
      const fullName = `${teacher.firstName} ${teacher.lastName}`.toLowerCase();
      const teacherId = (teacher.teacherId || '').toLowerCase();
      return fullName.includes(query) || teacherId.includes(query);
    });
  }

  filterSubjects() {
    if (!this.subjectSearchQuery.trim()) {
      this.filteredSubjects = [...this.subjects];
      return;
    }
    const query = this.subjectSearchQuery.toLowerCase().trim();
    this.filteredSubjects = this.subjects.filter(subject => {
      const name = (subject.name || '').toLowerCase();
      const code = (subject.code || '').toLowerCase();
      return name.includes(query) || code.includes(query);
    });
  }

  isTeacherSelected(teacherId: string): boolean {
    return this.selectedTeacherIds.includes(teacherId);
  }

  isSubjectSelected(subjectId: string): boolean {
    return this.selectedSubjectIds.includes(subjectId);
  }

  toggleTeacher(teacherId: string) {
    const index = this.selectedTeacherIds.indexOf(teacherId);
    if (index > -1) {
      this.selectedTeacherIds.splice(index, 1);
      if (this.selectedClassTeacherId === teacherId) {
        this.selectedClassTeacherId = '';
      }
    } else {
      this.selectedTeacherIds.push(teacherId);
    }
  }

  /** All active teachers, sorted by display name, for the Home Teacher dropdown. */
  get homeTeacherSelectOptions(): { id: string; label: string }[] {
    return [...this.teachers]
      .map((t) => ({
        id: t.id,
        label: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.id,
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      );
  }

  /** Ensure the chosen home teacher appears in the assigned-teachers list for a consistent UI. */
  onHomeTeacherChange(teacherId: string): void {
    if (teacherId && !this.selectedTeacherIds.includes(teacherId)) {
      this.selectedTeacherIds.push(teacherId);
    }
  }

  toggleSubject(subjectId: string) {
    const index = this.selectedSubjectIds.indexOf(subjectId);
    if (index > -1) {
      this.selectedSubjectIds.splice(index, 1);
    } else {
      this.selectedSubjectIds.push(subjectId);
    }
  }

  validateField(fieldName: string) {
    this.touchedFields.add(fieldName);
    const value = this.classItem[fieldName];
    
    switch (fieldName) {
      case 'name':
        if (!value || value.trim() === '') {
          this.fieldErrors[fieldName] = 'Class name is required';
        } else if (value.length > 50) {
          this.fieldErrors[fieldName] = 'Class name must be 50 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'form':
        if (!value || value.trim() === '') {
          this.fieldErrors[fieldName] = 'Form level is required';
        } else if (value.length > 30) {
          this.fieldErrors[fieldName] = 'Form level must be 30 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'description':
        if (value && value.length > 500) {
          this.fieldErrors[fieldName] = 'Description must be 500 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
    }
    // Trigger change detection after validation
    this.cdr.markForCheck();
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  onFieldChange(fieldName: string) {
    if (this.touchedFields.has(fieldName)) {
      // Defer validation to avoid ExpressionChangedAfterItHasBeenCheckedError
      Promise.resolve().then(() => {
        this.validateField(fieldName);
      });
    }
  }


  isFormValid(): boolean {
    // Check validity without modifying state to avoid ExpressionChangedAfterItHasBeenCheckedError
    const nameValid = !!this.classItem.name?.trim() && this.classItem.name.length <= 50;
    const formValid = !!this.classItem.form?.trim() && this.classItem.form.length <= 30;
    
    // Only check existing errors, don't create new ones during change detection
    const hasNameError = this.touchedFields.has('name') && !!this.fieldErrors['name'];
    const hasFormError = this.touchedFields.has('form') && !!this.fieldErrors['form'];
    
    return nameValid && formValid && !hasNameError && !hasFormError;
  }

  onSubmit() {
    // Mark all fields as touched
    this.touchedFields.add('name');
    this.touchedFields.add('form');
    this.touchedFields.add('description');
    
    // Validate all fields
    this.validateField('name');
    this.validateField('form');
    this.validateField('description');
    
    if (!this.isFormValid()) {
      this.error = 'Please fix the errors in the form';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.error = '';
    this.success = '';
    this.submitting = true;

    // Prepare class data
    const classData: any = {
      name: this.classItem.name.trim(),
      form: this.classItem.form.trim(),
      description: this.classItem.description?.trim() || '',
      isActive: this.classItem.isActive !== false
    };

    const mergedTeacherIds = [...this.selectedTeacherIds];
    if (
      this.selectedClassTeacherId &&
      !mergedTeacherIds.includes(this.selectedClassTeacherId)
    ) {
      mergedTeacherIds.push(this.selectedClassTeacherId);
    }
    classData.teacherIds = mergedTeacherIds;
    classData.classTeacherId = this.selectedClassTeacherId || null;

    if (this.selectedSubjectIds.length > 0) {
      classData.subjectIds = this.selectedSubjectIds;
    }

    if (this.isEdit) {
      this.classService.updateClass(this.classItem.id, classData).subscribe({
        next: () => {
          this.success = 'Class updated successfully!';
          this.submitting = false;
          // Show success message for 3 seconds before navigating
          setTimeout(() => {
            navigateToClassesList(this.router, { success: 'Class updated successfully!' });
          }, 3000);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to update class';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      this.classService.createClass(classData).subscribe({
        next: () => {
          this.success = 'Class created successfully!';
          this.submitting = false;
          // Show success message for 3 seconds before navigating
          setTimeout(() => {
            navigateToClassesList(this.router, { success: 'Class created successfully!' });
          }, 3000);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to create class';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }

  goToClassesList(): void {
    navigateToClassesList(this.router);
  }
}
