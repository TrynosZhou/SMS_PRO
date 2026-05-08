import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';

@Component({
  selector: 'app-my-classes',
  templateUrl: './my-classes.component.html',
  styleUrls: ['./my-classes.component.css']
})
export class MyClassesComponent implements OnInit {
  teacher: any = null;
  teacherName: string = '';
  classes: any[] = [];
  loading = false;
  error = '';
  searchTerm = '';
  filteredClasses: any[] = [];

  constructor(
    private authService: AuthService,
    private teacherService: TeacherService
  ) { }

  ngOnInit() {
    this.loadTeacherInfo();
  }

  private getFullName(firstName?: string, lastName?: string): string {
    // Handle null, undefined, or empty strings
    const first = (firstName && typeof firstName === 'string') ? firstName.trim() : '';
    const last = (lastName && typeof lastName === 'string') ? lastName.trim() : '';
    
    // Filter out default placeholder values
    const validFirst = (first && first !== 'Teacher' && first !== 'Account') ? first : '';
    const validLast = (last && last !== 'Teacher' && last !== 'Account') ? last : '';
    
    // Combine as LastName + FirstName (as requested)
    const parts = [validLast, validFirst].filter(part => part.length > 0);
    const fullName = parts.join(' ').trim();
    
    // Return full name if available, otherwise return 'Teacher'
    return fullName || 'Teacher';
  }

  loadTeacherInfo() {
    const user = this.authService.getCurrentUser();
    
    // Check if user is a teacher
    if (!user || user.role !== 'teacher') {
      this.error = 'Only teachers can access this page';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // First, get the teacher profile to get teacherId and full name
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        this.teacher = teacher;
        
        // Extract and format full name (LastName + FirstName)
        const firstName = (teacher.firstName && teacher.firstName.trim() && teacher.firstName !== 'Teacher' && teacher.firstName !== 'Account') ? teacher.firstName.trim() : '';
        const lastName = (teacher.lastName && teacher.lastName.trim() && teacher.lastName !== 'Teacher' && teacher.lastName !== 'Account') ? teacher.lastName.trim() : '';
        this.teacherName = this.getFullName(firstName, lastName);
        
        console.log('Teacher loaded:', {
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          fullName: this.teacherName,
          teacherId: teacher.teacherId
        });
        
        // Now fetch classes using the teacherId (from junction table)
        if (teacher.id) {
          console.log('Fetching classes for teacher ID:', teacher.id);
          this.loadTeacherClasses(teacher.id);
        } else {
          this.error = 'Teacher ID not found';
          this.loading = false;
        }
      },
      error: (err: any) => {
        console.error('Error loading teacher:', err);
        this.error = 'Failed to load teacher information. Please try again.';
        this.loading = false;
      }
    });
  }

  loadTeacherClasses(teacherId: string) {
    // Fetch classes from dedicated endpoint (uses junction table)
    this.teacherService.getTeacherClasses(teacherId).subscribe({
      next: (response: any) => {
        this.classes = response.classes || [];
        this.filteredClasses = [...this.classes];
        this.loading = false;
        
        console.log('✓ Classes loaded from junction table:', this.classes.length);
        console.log('Classes:', this.classes.map(c => c.name).join(', '));
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.error = 'Failed to load classes. Please try again.';
        this.loading = false;
        this.classes = [];
        this.filteredClasses = [];
      }
    });
  }

  filterClasses() {
    if (!this.searchTerm.trim()) {
      this.filteredClasses = [...this.classes];
      return;
    }

    const term = this.searchTerm.toLowerCase().trim();
    this.filteredClasses = this.classes.filter(classItem =>
      classItem.name.toLowerCase().includes(term) ||
      classItem.form.toLowerCase().includes(term) ||
      (classItem.description && classItem.description.toLowerCase().includes(term))
    );
  }

  clearSearch() {
    this.searchTerm = '';
    this.filterClasses();
  }

  getClassStatusClass(isActive: boolean): string {
    return isActive ? 'status-active' : 'status-inactive';
  }

  getClassStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }
}

