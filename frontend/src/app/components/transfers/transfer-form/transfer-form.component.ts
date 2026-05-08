import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TransferService, TransferRequest } from '../../../services/transfer.service';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-transfer-form',
  templateUrl: './transfer-form.component.html',
  styleUrls: ['./transfer-form.component.css']
})
export class TransferFormComponent implements OnInit {
  transfer: TransferRequest = {
    studentId: '',
    transferType: 'internal',
    newClassId: '',
    destinationSchool: '',
    reason: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    notes: ''
  };

  students: any[] = [];
  classes: any[] = [];
  filteredStudents: any[] = [];
  selectedStudent: any = null;
  loading = false;
  submitting = false;
  error = '';
  success = '';
  searchQuery = '';
  maxEffectiveDate = new Date().toISOString().split('T')[0];

  constructor(
    private transferService: TransferService,
    private studentService: StudentService,
    private classService: ClassService,
    public router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.loadStudents();
    this.loadClasses();
    
    // Check if studentId is provided in route params
    const studentId = this.route.snapshot.queryParams['studentId'];
    if (studentId) {
      this.transfer.studentId = studentId;
      this.onStudentSelect();
    }
  }

  loadStudents() {
    this.loading = true;
    this.studentService.getStudents({ limit: 500 }).subscribe({
      next: (data: any) => {
        // Only show active students for transfer
        this.students = (data || []).filter((s: any) => s.isActive !== false);
        this.filteredStudents = this.students;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading students:', err);
        this.error = 'Failed to load students';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        // Only show active classes
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
    if (this.transfer.studentId) {
      this.selectedStudent = this.students.find(s => s.id === this.transfer.studentId);
      if (this.selectedStudent && this.selectedStudent.classEntity) {
        // Pre-fill previous class info for display
        console.log('Selected student:', this.selectedStudent);
      }
    } else {
      this.selectedStudent = null;
    }
  }

  onTransferTypeChange() {
    // Reset type-specific fields when switching types
    if (this.transfer.transferType === 'internal') {
      this.transfer.destinationSchool = '';
    } else {
      this.transfer.newClassId = '';
    }
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.submitting = true;

    // Validate required fields
    if (!this.transfer.studentId) {
      this.error = 'Please select a student';
      this.submitting = false;
      return;
    }

    if (this.transfer.transferType === 'internal') {
      if (!this.transfer.newClassId) {
        this.error = 'Please select a new class for internal transfer';
        this.submitting = false;
        return;
      }
      
      if (this.selectedStudent?.classId === this.transfer.newClassId) {
        this.error = 'Student is already in the selected class';
        this.submitting = false;
        return;
      }
    } else {
      if (!this.transfer.destinationSchool || !this.transfer.destinationSchool.trim()) {
        this.error = 'Please enter destination school name for external transfer';
        this.submitting = false;
        return;
      }
    }

    if (!this.transfer.effectiveDate) {
      this.transfer.effectiveDate = this.maxEffectiveDate;
    }

    this.transferService.initiateTransfer(this.transfer).subscribe({
      next: (response: any) => {
        this.success = response.message || 'Transfer completed successfully';
        this.submitting = false;
        setTimeout(() => {
          this.navigateToHistory();
        }, 2000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to process transfer';
        this.submitting = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  getCurrentClassName(): string {
    if (!this.selectedStudent?.classEntity) return 'N/A';
    return this.selectedStudent.classEntity.name || 'N/A';
  }

  navigateToHistory() {
    this.router.navigate(['/transfers/history']);
  }
}

