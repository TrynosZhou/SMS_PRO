import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-dh-services-report',
  templateUrl: './dh-services-report.component.html',
  styleUrls: ['./dh-services-report.component.css']
})
export class DHServicesReportComponent implements OnInit {
  students: any[] = [];
  filteredStudents: any[] = [];
  loading = false;
  error = '';
  searchTerm = '';
  schoolName = '';
  currentTerm = '';
  currentYear = '';

  constructor(
    private studentService: StudentService,
    private settingsService: SettingsService
  ) { }

  ngOnInit() {
    this.loadSettings();
    this.loadReport();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.schoolName = settings.schoolName || 'School';
        this.currentTerm = settings.currentTerm || 'Term 1';
        this.currentYear = settings.academicYear || new Date().getFullYear().toString();
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.schoolName = 'School';
        this.currentTerm = 'Term 1';
        this.currentYear = new Date().getFullYear().toString();
      }
    });
  }

  loadReport() {
    this.loading = true;
    this.error = '';
    
    this.studentService.getDHServicesReport().subscribe({
      next: (response: any) => {
        this.students = response.students || [];
        this.filteredStudents = [...this.students];
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to load DH Services report';
        this.loading = false;
        console.error('Error loading DH Services report:', err);
      }
    });
  }

  filterStudents() {
    if (!this.searchTerm.trim()) {
      this.filteredStudents = [...this.students];
      return;
    }

    const term = this.searchTerm.toLowerCase().trim();
    this.filteredStudents = this.students.filter(student =>
      student.firstName?.toLowerCase().includes(term) ||
      student.lastName?.toLowerCase().includes(term) ||
      student.studentNumber?.toLowerCase().includes(term) ||
      student.class?.toLowerCase().includes(term)
    );
  }

  downloadCSV() {
    if (this.filteredStudents.length === 0) {
      this.error = 'No data to download';
      return;
    }

    const headers = ['Student Number', 'First Name', 'Last Name', 'Gender', 'Class', 'Student Type', 'Contact Number', 'Staff Child'];
    const rows = this.filteredStudents.map(student => [
      student.studentNumber || '',
      student.firstName || '',
      student.lastName || '',
      student.gender || '',
      student.class || 'N/A',
      student.studentType || '',
      student.contactNumber || 'N/A',
      student.isStaffChild ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `DH_Services_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  printReport() {
    window.print();
  }
}

