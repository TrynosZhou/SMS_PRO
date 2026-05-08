import { Component, OnInit } from '@angular/core';
import { TeacherService } from '../../../services/teacher.service';
import { RecordBookService } from '../../../services/record-book.service';
import { SettingsService } from '../../../services/settings.service';
import { ClassService } from '../../../services/class.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-teacher-record-book',
  templateUrl: './teacher-record-book.component.html',
  styleUrls: ['./teacher-record-book.component.css']
})
export class TeacherRecordBookComponent implements OnInit {
  searchTerm: string = '';
  studentSearchTerm: string = '';
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  selectedTeacher: any = null;
  teacherClasses: any[] = [];
  selectedClassId: string = '';
  selectedClass: any = null;
  availableSubjects: any[] = [];
  selectedSubjectId: string = '';
  selectedSubject: any = null;
  students: any[] = [];
  filteredStudents: any[] = [];
  loading = false;
  error = '';
  success = '';
  
  // Settings
  schoolName = '';
  currentTerm = '';
  currentYear = '';
  
  // Topics and dates for each test
  topics = {
    test1: '',
    test2: '',
    test3: '',
    test4: '',
    test5: '',
    test6: '',
    test7: '',
    test8: '',
    test9: '',
    test10: ''
  };

  testDates = {
    test1: '',
    test2: '',
    test3: '',
    test4: '',
    test5: '',
    test6: '',
    test7: '',
    test8: '',
    test9: '',
    test10: ''
  };

  // Number of visible test columns
  visibleTests = 4;
  maxTests = 10;

  constructor(
    private teacherService: TeacherService,
    private recordBookService: RecordBookService,
    private settingsService: SettingsService,
    private classService: ClassService,
    private http: HttpClient
  ) { }

  ngOnInit() {
    this.loadSettings();
    this.loadTeachers();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.schoolName = settings.schoolName || 'School';
        this.currentTerm = settings.currentTerm || 'Term 1';
        this.currentYear = settings.academicYear || new Date().getFullYear().toString();
      },
      error: (err: any) => {
        // Only log if it's not a connection error (connection errors are expected if backend is down)
        if (err.status !== 0 && err.status !== undefined) {
          console.error('Error loading settings:', err);
        }
        // Set default values if settings can't be loaded
        this.schoolName = 'School';
        this.currentTerm = 'Term 1';
        this.currentYear = new Date().getFullYear().toString();
      }
    });
  }

  loadTeachers() {
    this.loading = true;
    this.teacherService.getTeachers().subscribe({
      next: (teachers: any[]) => {
        this.teachers = teachers || [];
        this.filteredTeachers = [...this.teachers];
        this.loading = false;
        this.error = ''; // Clear any previous errors
      },
      error: (err: any) => {
        // Check if it's a connection error
        if (err.status === 0 || err.message?.includes('Connection refused') || err.message?.includes('Failed to fetch')) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
          console.warn('Backend server connection failed. Please start the backend server.');
        } else {
          console.error('Error loading teachers:', err);
          this.error = err.error?.message || 'Failed to load teachers. Please try again.';
        }
        this.loading = false;
        this.teachers = [];
        this.filteredTeachers = [];
      }
    });
  }

  searchTeachers() {
    if (!this.searchTerm.trim()) {
      this.filteredTeachers = [...this.teachers];
      return;
    }

    const term = this.searchTerm.toLowerCase().trim();
    this.filteredTeachers = this.teachers.filter(teacher =>
      teacher.teacherId?.toLowerCase().includes(term) ||
      teacher.firstName?.toLowerCase().includes(term) ||
      teacher.lastName?.toLowerCase().includes(term)
    );
  }

  selectTeacher(teacher: any) {
    this.selectedTeacher = teacher;
    const classesList = teacher.classes || [];
    this.teacherClasses = this.classService.sortClasses(classesList);
    this.availableSubjects = teacher.subjects || [];
    this.selectedClassId = '';
    this.selectedClass = null;
    this.selectedSubjectId = '';
    this.selectedSubject = null;
    this.students = [];
    this.filteredStudents = [];
    this.error = '';
  }

  clearSearch() {
    this.searchTerm = '';
    this.filteredTeachers = [...this.teachers];
    this.selectedTeacher = null;
    this.teacherClasses = [];
    this.availableSubjects = [];
    this.selectedClassId = '';
    this.selectedClass = null;
    this.selectedSubjectId = '';
    this.selectedSubject = null;
    this.students = [];
    this.filteredStudents = [];
  }

  onClassClick(classItem: any) {
    this.selectedClassId = classItem.id;
    this.selectedClass = classItem;
    // Don't auto-load - wait for subject selection
    if (this.selectedSubjectId) {
      this.loadRecordBook(classItem.id);
    }
  }

  onSubjectChange() {
    if (this.selectedSubjectId) {
      this.selectedSubject = this.availableSubjects.find(s => s.id === this.selectedSubjectId) || null;
      if (this.selectedClassId) {
        this.loadRecordBook(this.selectedClassId);
      }
    } else {
      this.selectedSubject = null;
      this.students = [];
      this.filteredStudents = [];
    }
  }

  loadRecordBook(classId: string) {
    if (!classId || !this.selectedTeacher || !this.selectedSubjectId) {
      if (!this.selectedSubjectId) {
        this.error = 'Please select a subject first';
      }
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Use admin endpoint to get record book for any teacher's class
    const apiUrl = environment.apiUrl;
    this.http.get(`${apiUrl}/record-book/admin/class/${classId}?teacherId=${this.selectedTeacher.id}&subjectId=${this.selectedSubjectId}`).subscribe({
      next: (response: any) => {
        this.students = response.students || [];
        this.currentTerm = response.term || this.currentTerm;
        this.currentYear = response.year || this.currentYear;
        
        // Initialize topics and dates from first student's record if available
        if (this.students.length > 0) {
          const firstStudent = this.students[0];
          this.topics.test1 = firstStudent.test1Topic || '';
          this.topics.test2 = firstStudent.test2Topic || '';
          this.topics.test3 = firstStudent.test3Topic || '';
          this.topics.test4 = firstStudent.test4Topic || '';
          this.topics.test5 = firstStudent.test5Topic || '';
          this.topics.test6 = firstStudent.test6Topic || '';
          this.topics.test7 = firstStudent.test7Topic || '';
          this.topics.test8 = firstStudent.test8Topic || '';
          this.topics.test9 = firstStudent.test9Topic || '';
          this.topics.test10 = firstStudent.test10Topic || '';
          
          this.testDates.test1 = firstStudent.test1Date ? this.formatDate(firstStudent.test1Date) : '';
          this.testDates.test2 = firstStudent.test2Date ? this.formatDate(firstStudent.test2Date) : '';
          this.testDates.test3 = firstStudent.test3Date ? this.formatDate(firstStudent.test3Date) : '';
          this.testDates.test4 = firstStudent.test4Date ? this.formatDate(firstStudent.test4Date) : '';
          this.testDates.test5 = firstStudent.test5Date ? this.formatDate(firstStudent.test5Date) : '';
          this.testDates.test6 = firstStudent.test6Date ? this.formatDate(firstStudent.test6Date) : '';
          this.testDates.test7 = firstStudent.test7Date ? this.formatDate(firstStudent.test7Date) : '';
          this.testDates.test8 = firstStudent.test8Date ? this.formatDate(firstStudent.test8Date) : '';
          this.testDates.test9 = firstStudent.test9Date ? this.formatDate(firstStudent.test9Date) : '';
          this.testDates.test10 = firstStudent.test10Date ? this.formatDate(firstStudent.test10Date) : '';
          
          // Determine visible tests based on existing data
          for (let i = 10; i >= 4; i--) {
            const testKey = `test${i}`;
            const topicKey = `test${i}Topic`;
            const hasData = this.students.some((s: any) => s[testKey] !== null || s[topicKey]);
            if (hasData) {
              this.visibleTests = i;
              break;
            }
          }
        }
        
        this.filteredStudents = [...this.students];
        this.loading = false;
      },
      error: (err: any) => {
        // Check if it's a connection error
        if (err.status === 0 || err.message?.includes('Connection refused') || err.message?.includes('Failed to fetch')) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else {
          this.error = err.error?.message || 'Failed to load record book. Please try again.';
        }
        this.loading = false;
        this.students = [];
        this.filteredStudents = [];
      }
    });
  }

  filterStudents() {
    if (!this.studentSearchTerm.trim()) {
      this.filteredStudents = [...this.students];
      return;
    }

    const term = this.studentSearchTerm.toLowerCase().trim();
    this.filteredStudents = this.students.filter(student =>
      student.firstName?.toLowerCase().includes(term) ||
      student.lastName?.toLowerCase().includes(term) ||
      student.studentNumber?.toLowerCase().includes(term)
    );
  }

  clearStudentSearch() {
    this.studentSearchTerm = '';
    this.filterStudents();
  }

  formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDateDisplay(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear().toString().slice(-2);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}.${month}.${year}`;
  }

  getVisibleTestNumbers(): number[] {
    return Array.from({ length: this.visibleTests }, (_, i) => i + 1);
  }

  getGradeIcon(mark: number): string {
    if (mark >= 80) return '⭐';
    if (mark >= 60) return '✓';
    if (mark >= 40) return '○';
    return '✗';
  }

  getCompletedCount(): number {
    let completed = 0;
    for (const student of this.students) {
      for (let i = 1; i <= this.visibleTests; i++) {
        const mark = student[`test${i}`];
        if (mark !== null && mark !== '' && mark !== undefined) {
          completed++;
        }
      }
    }
    return completed;
  }

  getPendingCount(): number {
    const total = this.students.length * this.visibleTests;
    return total - this.getCompletedCount();
  }

  getAverageScore(): string {
    let totalMarks = 0;
    let count = 0;
    
    for (const student of this.students) {
      for (let i = 1; i <= this.visibleTests; i++) {
        const mark = student[`test${i}`];
        if (mark !== null && mark !== '' && mark !== undefined) {
          totalMarks += parseFloat(mark);
          count++;
        }
      }
    }
    
    return count > 0 ? (totalMarks / count).toFixed(1) : '0.0';
  }

  exportToExcel() {
    if (!this.selectedClass || !this.selectedTeacher) {
      this.error = 'Please select a teacher and class first';
      return;
    }

    if (this.students.length === 0) {
      this.error = 'No student data to export';
      return;
    }

    const data: any[] = [];
    
    // School information header rows
    data.push([this.schoolName || 'School Management System']);
    if (this.selectedTeacher) {
      data.push([`Teacher: ${this.selectedTeacher.firstName} ${this.selectedTeacher.lastName} (${this.selectedTeacher.teacherId})`]);
    }
    if (this.selectedClass) {
      data.push([`Class: ${this.selectedClass.name}`]);
    }
    data.push([`Term: ${this.currentTerm} | Year: ${this.currentYear}`]);
    data.push([]); // Empty row for spacing
    
    // Header row with dates
    const headers = ['#', 'Student ID', 'Last Name', 'First Name'];
    for (let i = 1; i <= this.visibleTests; i++) {
      const key = `test${i}` as keyof typeof this.testDates;
      const date = this.testDates[key];
      const dateStr = date ? this.formatDateDisplay(date) : '';
      headers.push(dateStr ? `Test ${i} (${dateStr})` : `Test ${i}`);
    }
    data.push(headers);
    
    // Student rows
    this.filteredStudents.forEach((student, index) => {
      const row = [
        index + 1,
        student.studentNumber,
        student.lastName,
        student.firstName
      ];
      
      for (let i = 1; i <= this.visibleTests; i++) {
        const mark = student[`test${i}`];
        row.push(mark !== null && mark !== '' ? mark : '—');
      }
      
      data.push(row);
    });
    
    // Topic row (below student marks, like in the image)
    const topicRow = ['', '', 'TOPIC', ''];
    for (let i = 1; i <= this.visibleTests; i++) {
      const key = `test${i}` as keyof typeof this.topics;
      topicRow.push(this.topics[key] || '—');
    }
    data.push(topicRow);
    
    // Convert to CSV
    const csv = data.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const teacherName = `${this.selectedTeacher?.lastName || ''}_${this.selectedTeacher?.firstName || ''}`.replace(/\s+/g, '_');
    link.download = `RecordBook_${teacherName}_${this.selectedClass.name}_${this.currentTerm}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    
    this.success = 'Record book exported successfully!';
    setTimeout(() => this.success = '', 3000);
  }

  printRecordBook() {
    window.print();
  }

  downloadPDF() {
    if (!this.selectedClassId || !this.selectedTeacher || !this.selectedSubjectId) {
      this.error = 'Please select a teacher, class, and subject first';
      return;
    }

    this.loading = true;
    this.error = '';
    const apiUrl = environment.apiUrl;
    
    this.http.get(`${apiUrl}/record-book/admin/pdf/${this.selectedClassId}?teacherId=${this.selectedTeacher.id}&subjectId=${this.selectedSubjectId}`, {
      responseType: 'blob'
    }).subscribe({
      next: (blob: Blob) => {
        if (blob.size === 0) {
          this.error = 'Received empty PDF file';
          this.loading = false;
          return;
        }
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const teacherName = `${this.selectedTeacher?.lastName || ''}_${this.selectedTeacher?.firstName || ''}`.replace(/\s+/g, '_');
        link.download = `RecordBook_${teacherName}_${this.selectedClass.name}_${this.currentTerm}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        this.loading = false;
        this.success = 'PDF downloaded successfully';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        // Check if it's a connection error
        if (err.status === 0 || err.message?.includes('Connection refused') || err.message?.includes('Failed to fetch')) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else {
          console.error('PDF download error:', err);
          this.error = err.error?.message || err.message || 'Failed to download PDF. Please try again.';
        }
        this.loading = false;
      }
    });
  }
}

