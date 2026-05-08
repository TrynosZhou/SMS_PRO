import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { EnrollmentService } from '../../../services/enrollment.service';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { isInStudentsManageShell } from '../../students/students-manage-navigation';

@Component({
  selector: 'app-enroll-student',
  templateUrl: './enroll-student.component.html',
  styleUrls: ['./enroll-student.component.css']
})
export class EnrollStudentComponent implements OnInit {
  enrollment: any = {
    studentId: '',
    classId: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
    notes: ''
  };

  students: any[] = [];
  filteredStudents: any[] = [];
  classes: any[] = [];
  selectedStudent: any = null;
  loading = false;
  submitting = false;
  error = '';
  success = '';
  searchQuery = '';
  maxDate = new Date().toISOString().split('T')[0];

  constructor(
    private enrollmentService: EnrollmentService,
    private studentService: StudentService,
    private classService: ClassService,
    public router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.loadUnenrolledStudents();
    this.loadClasses();
    
    // Check if studentId is provided in route params
    const studentId = this.route.snapshot.queryParams['studentId'];
    if (studentId) {
      this.enrollment.studentId = studentId;
      this.onStudentSelect();
    }
  }

  loadUnenrolledStudents() {
    this.loading = true;
    this.enrollmentService.getUnenrolledStudents().subscribe({
      next: (data: any) => {
        this.students = data || [];
        this.filteredStudents = this.students;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading unenrolled students:', err);
        this.error = 'Failed to load students';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        const activeClasses = classesList.filter((c: any) => c.isActive !== false);
        this.classes = this.classService.sortClasses(activeClasses);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  filterStudents() {
    if (!this.searchQuery.trim()) {
      this.filteredStudents = this.students;
      return;
    }
    const query = this.searchQuery.toLowerCase();
    this.filteredStudents = this.students.filter((s: any) =>
      s.studentNumber?.toLowerCase().includes(query) ||
      s.firstName?.toLowerCase().includes(query) ||
      s.lastName?.toLowerCase().includes(query) ||
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(query)
    );
  }

  onStudentSelect() {
    if (this.enrollment.studentId) {
      this.selectedStudent = this.students.find(s => s.id === this.enrollment.studentId);
    } else {
      this.selectedStudent = null;
    }
  }

  goToUnenrolled(): void {
    if (isInStudentsManageShell(this.router)) {
      this.router.navigate(['/students', 'manage', 'unenrolled']);
    } else {
      this.router.navigate(['/enrollments', 'unenrolled']);
    }
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.submitting = true;

    if (!this.enrollment.studentId) {
      this.error = 'Please select a student';
      this.submitting = false;
      return;
    }

    if (!this.enrollment.classId) {
      this.error = 'Please select a class';
      this.submitting = false;
      return;
    }

    this.enrollmentService.enrollStudent(this.enrollment).subscribe({
      next: (response: any) => {
        this.success = response.message || 'Student enrolled successfully';
        this.submitting = false;
        setTimeout(() => {
          if (isInStudentsManageShell(this.router)) {
            this.router.navigate(['/students', 'manage', 'unenrolled']);
          } else {
            this.router.navigate(['/enrollments', 'unenrolled']);
          }
        }, 2000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to enroll student';
        this.submitting = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}

