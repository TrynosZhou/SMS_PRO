import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';
import { RecordBookService } from '../../../services/record-book.service';
import { SettingsService } from '../../../services/settings.service';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-record-book',
  templateUrl: './record-book.component.html',
  styleUrls: ['./record-book.component.css']
})
export class RecordBookComponent implements OnInit {
  teacher: any = null;
  teacherClasses: any[] = [];
  selectedClassId: string = '';
  selectedClass: any = null;
  availableSubjects: any[] = [];
  selectedSubjectId: string = '';
  selectedSubject: any = null;
  students: any[] = [];
  filteredStudents: any[] = [];
  searchTerm: string = '';
  teacherSubjects: string = '';
  loading = false;
  saving = false;
  private autoSaveTimers: Record<string, any> = {};
  private autoSaveRequestsInFlight = 0;
  readonly autoSaveDelayMs = 700;
  error = '';
  success = '';
  
  // Settings
  schoolName = '';
  currentTerm = '';
  currentYear = '';
  
  // Topics for each test (no defaults - teacher must enter)
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

  // Dates for each test
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

  // Number of visible test columns (default 4, expandable to 10)
  visibleTests = 4;
  maxTests = 10;

  get autoSavingActive(): boolean {
    return this.autoSaveRequestsInFlight > 0 || Object.keys(this.autoSaveTimers).length > 0;
  }

  constructor(
    private authService: AuthService,
    private teacherService: TeacherService,
    private recordBookService: RecordBookService,
    private settingsService: SettingsService,
    private classService: ClassService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadSettings();
    this.loadTeacherInfo();
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
        // Set defaults if settings can't be loaded
        this.schoolName = 'School';
        this.currentTerm = 'Term 1';
        this.currentYear = new Date().getFullYear().toString();
      }
    });
  }

  loadTeacherInfo() {
    const user = this.authService.getCurrentUser();
    
    // Check if user is a teacher
    if (!user || user.role !== 'teacher') {
      this.error = 'Only teachers can access the record book';
      return;
    }

    this.loading = true;
    
    // First, get the teacher profile to get teacherId
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        this.teacher = teacher;
        
        // Log success for debugging
        console.log('Teacher loaded successfully:', teacher.firstName, teacher.lastName);
        console.log('Teacher ID:', teacher.id);
        console.log('Teacher subjects:', teacher.subjects);
        
        // Now fetch classes using the new endpoint with teacherId
        if (teacher.id) {
          this.loadTeacherClasses(teacher.id);
        } else {
          // Fallback to classes from teacher object
          this.teacherClasses = teacher.classes || [];
          this.loading = false;
          this.handleQueryParams();
        }
      },
      error: (err: any) => {
        console.error('Error loading teacher:', err);
        
        if (err.status === 404) {
          this.error = 'No teacher profile found for your account. Please contact the administrator.';
        } else if (err.status === 401) {
          this.error = 'You are not authenticated. Please log in again.';
        } else if (err.status === 0 || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running.';
        } else {
          this.error = 'Failed to load teacher information. Please try again.';
        }
        
        this.loading = false;
      }
    });
  }

  loadTeacherClasses(teacherId: string) {
    console.log('Loading classes for teacherId:', teacherId);
    
    // Use the new endpoint to fetch classes from junction table
    this.teacherService.getTeacherClasses(teacherId).subscribe({
      next: (response: any) => {
        const classesList = response.classes || [];
        this.teacherClasses = this.classService.sortClasses(classesList);
        this.loading = false;
        
        console.log('Assigned classes loaded:', this.teacherClasses.length);
        console.log('Classes:', this.teacherClasses.map((c: any) => c.name).join(', '));
        
        // Handle query params after classes are loaded
        this.handleQueryParams();
      },
      error: (err: any) => {
        console.error('Error loading teacher classes:', err);
        
        // Fallback: try to get classes from teacher object if available
        if (this.teacher && this.teacher.classes) {
          const fallbackClasses = this.teacher.classes || [];
          this.teacherClasses = this.classService.sortClasses(fallbackClasses);
          console.log('Using fallback classes from teacher object:', this.teacherClasses.length);
        } else {
          this.teacherClasses = [];
          this.error = 'Failed to load classes. Please try again.';
          setTimeout(() => this.error = '', 5000);
        }
        
        this.loading = false;
        this.handleQueryParams();
      }
    });
  }

  handleQueryParams() {
    // Check for classId in query params after classes are loaded
    this.route.queryParams.subscribe(params => {
      const classId = params['classId'];
      if (classId && this.teacherClasses.length > 0) {
        // Check if the classId exists in teacher's classes
        const classExists = this.teacherClasses.find((c: any) => c.id === classId);
        if (classExists) {
          this.selectedClassId = classId;
          this.onClassChange();
        } else {
          this.error = 'You are not assigned to this class.';
          setTimeout(() => this.error = '', 5000);
        }
      }
    });
  }

  onClassChange() {
    if (!this.selectedClassId) {
      this.clearAutoSaveTimers();
      this.students = [];
      this.filteredStudents = [];
      this.selectedClass = null;
      this.selectedSubjectId = '';
      this.selectedSubject = null;
      this.availableSubjects = [];
      this.searchTerm = '';
      this.teacherSubjects = '';
      return;
    }

    this.selectedClass = this.teacherClasses.find(c => c.id === this.selectedClassId);
    
    // Fetch class details with subjects to filter teacher's subjects
    this.loadClassWithSubjects();
    // Don't load record book until subject is selected
  }

  loadClassWithSubjects() {
    if (!this.selectedClassId) {
      this.teacherSubjects = '';
      return;
    }

    // Fetch class details with subjects
    this.classService.getClassById(this.selectedClassId).subscribe({
      next: (classData: any) => {
        this.selectedClass = classData;
        this.loadTeacherSubjectsForClass(classData);
      },
      error: (err: any) => {
        console.error('Error loading class details:', err);
        // Fallback to showing all teacher subjects if class fetch fails
        this.loadTeacherSubjects();
      }
    });
  }

  loadTeacherSubjectsForClass(classData: any) {
    // Get subjects that the teacher teaches AND that are taught in the selected class
    if (!this.teacher || !this.teacher.subjects || this.teacher.subjects.length === 0) {
      this.teacherSubjects = 'No subjects assigned';
      this.availableSubjects = [];
      return;
    }

    if (!classData || !classData.subjects || classData.subjects.length === 0) {
      this.teacherSubjects = 'No subjects assigned to this class';
      this.availableSubjects = [];
      return;
    }

    // Find intersection: subjects that teacher teaches AND that are in the class
    const teacherSubjectIds = this.teacher.subjects.map((s: any) => s.id);
    const classSubjectIds = classData.subjects.map((s: any) => s.id);
    
    // Filter teacher's subjects to only include those in the class
    const matchingSubjects = this.teacher.subjects.filter((teacherSubject: any) => 
      classSubjectIds.includes(teacherSubject.id)
    );

    if (matchingSubjects.length > 0) {
      // Store available subjects for the dropdown
      this.availableSubjects = matchingSubjects;
      const subjectNames = matchingSubjects.map((s: any) => s.name).join(', ');
      this.teacherSubjects = subjectNames;
      
      // Auto-select first subject if only one is available
      if (matchingSubjects.length === 1) {
        this.selectedSubjectId = matchingSubjects[0].id;
        this.selectedSubject = matchingSubjects[0];
        this.onSubjectChange();
      } else {
        // Reset subject selection if multiple subjects
        this.selectedSubjectId = '';
        this.selectedSubject = null;
        this.students = [];
        this.filteredStudents = [];
      }
    } else {
      this.teacherSubjects = 'No matching subjects found';
      this.availableSubjects = [];
      this.selectedSubjectId = '';
      this.selectedSubject = null;
      this.students = [];
      this.filteredStudents = [];
    }
  }

  onSubjectChange() {
    if (!this.selectedSubjectId) {
      this.clearAutoSaveTimers();
      this.students = [];
      this.filteredStudents = [];
      this.selectedSubject = null;
      return;
    }

    this.selectedSubject = this.availableSubjects.find(s => s.id === this.selectedSubjectId);
    
    if (this.selectedSubjectId && this.selectedClassId) {
      this.loadRecordBook();
    }
  }

  loadTeacherSubjects() {
    // Get all subjects from teacher profile (fallback method)
    if (this.teacher && this.teacher.subjects && this.teacher.subjects.length > 0) {
      // Join all subject names with commas
      const subjectNames = this.teacher.subjects.map((s: any) => s.name).join(', ');
      this.teacherSubjects = subjectNames;
    } else {
      this.teacherSubjects = 'No subjects assigned';
    }
  }

  loadRecordBook() {
    if (!this.selectedClassId || !this.selectedSubjectId) return;

    this.loading = true;
    this.error = '';
    
    this.recordBookService.getRecordBookByClass(this.selectedClassId, this.selectedSubjectId).subscribe({
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
        this.error = err.error?.message || 'Failed to load record book';
        this.loading = false;
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
      student.firstName.toLowerCase().includes(term) ||
      student.lastName.toLowerCase().includes(term) ||
      student.studentNumber.toLowerCase().includes(term)
    );
  }

  clearSearch() {
    this.searchTerm = '';
    this.filterStudents();
  }

  private clearAutoSaveTimers(): void {
    for (const key of Object.keys(this.autoSaveTimers)) {
      clearTimeout(this.autoSaveTimers[key]);
      delete this.autoSaveTimers[key];
    }
  }

  private scheduleAutoSaveForStudent(student: any): void {
    const studentId = student?.studentId;
    if (!studentId) return;

    // Debounce per-student edits to reduce API calls.
    if (this.autoSaveTimers[studentId]) {
      clearTimeout(this.autoSaveTimers[studentId]);
      delete this.autoSaveTimers[studentId];
    }

    this.autoSaveTimers[studentId] = setTimeout(() => {
      delete this.autoSaveTimers[studentId];
      this.autoSaveRequestsInFlight++;
      this.saveStudentMarks(student, true);
    }, this.autoSaveDelayMs);
  }

  onMarkChange(student: any, testNumber: number) {
    // Auto-save (debounced) when a mark changes
    const testKey = `test${testNumber}`;
    const mark = student[testKey];
    
    // Validate mark (0-100)
    if (mark !== null && mark !== '' && (mark < 0 || mark > 100)) {
      this.error = 'Marks must be between 0 and 100';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    this.scheduleAutoSaveForStudent(student);
  }

  saveStudentMarks(student: any, isAutoSave: boolean = false) {
    if (!this.selectedSubjectId) {
      this.error = 'Please select a subject first';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    const data: any = {
      classId: this.selectedClassId,
      subjectId: this.selectedSubjectId,
      studentId: student.studentId,
      test1: student.test1,
      test2: student.test2,
      test3: student.test3,
      test4: student.test4,
      test5: student.test5,
      test6: student.test6,
      test7: student.test7,
      test8: student.test8,
      test9: student.test9,
      test10: student.test10,
      test1Topic: this.topics.test1,
      test1Date: this.testDates.test1,
      test2Topic: this.topics.test2,
      test2Date: this.testDates.test2,
      test3Topic: this.topics.test3,
      test3Date: this.testDates.test3,
      test4Topic: this.topics.test4,
      test4Date: this.testDates.test4,
      test5Topic: this.topics.test5,
      test5Date: this.testDates.test5,
      test6Topic: this.topics.test6,
      test6Date: this.testDates.test6,
      test7Topic: this.topics.test7,
      test7Date: this.testDates.test7,
      test8Topic: this.topics.test8,
      test8Date: this.testDates.test8,
      test9Topic: this.topics.test9,
      test9Date: this.testDates.test9,
      test10Topic: this.topics.test10,
      test10Date: this.testDates.test10
    };

    this.recordBookService.saveMarks(data).subscribe({
      next: () => {
        // Silent save - no success message for individual saves
      },
      error: (err: any) => {
        this.error = 'Failed to save marks';
        setTimeout(() => this.error = '', 3000);
        if (isAutoSave) {
          this.autoSaveRequestsInFlight = Math.max(0, this.autoSaveRequestsInFlight - 1);
        }
      },
      complete: () => {
        if (isAutoSave) {
          this.autoSaveRequestsInFlight = Math.max(0, this.autoSaveRequestsInFlight - 1);
        }
      }
    });
  }

  saveAllMarks() {
    // Avoid races while batch-saving.
    this.clearAutoSaveTimers();
    if (!this.selectedClassId || !this.selectedSubjectId || this.students.length === 0) {
      this.error = !this.selectedSubjectId ? 'Please select a subject first' : 'No students to save';
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';

    const records = this.students.map(student => ({
      studentId: student.studentId,
      test1: student.test1,
      test2: student.test2,
      test3: student.test3,
      test4: student.test4,
      test5: student.test5,
      test6: student.test6,
      test7: student.test7,
      test8: student.test8,
      test9: student.test9,
      test10: student.test10
    }));

    this.recordBookService.batchSaveMarks(this.selectedClassId, this.selectedSubjectId, records, this.topics, this.testDates).subscribe({
      next: () => {
        this.success = 'All marks saved successfully';
        this.saving = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to save marks';
        this.saving = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  clearVisibleMarks() {
    if (!this.selectedClassId || !this.selectedSubjectId || this.students.length === 0) {
      this.error = 'Select a class and subject first';
      setTimeout(() => (this.error = ''), 3000);
      return;
    }

    const ok = confirm(`Clear marks, topics and dates for Tests 1-${this.visibleTests}?`);
    if (!ok) return;

    for (const student of this.students) {
      for (let i = 1; i <= this.visibleTests; i++) {
        student[`test${i}`] = null;
      }
    }

    for (let i = 1; i <= this.visibleTests; i++) {
      this.topics[`test${i}` as keyof typeof this.topics] = '';
      this.testDates[`test${i}` as keyof typeof this.testDates] = '';
    }

    this.error = '';
    this.success = '';
    this.saveAllMarks();
  }

  onTopicChange() {
    // Update topics for all students when topic changes
    if (this.students.length > 0) {
      this.saveAllMarks();
    }
  }

  addTestColumn() {
    if (this.visibleTests < this.maxTests) {
      this.visibleTests++;
    }
  }

  removeTestColumn() {
    if (this.visibleTests > 1) {
      this.visibleTests--;
    }
  }

  getVisibleTestNumbers(): number[] {
    return Array.from({ length: this.visibleTests }, (_, i) => i + 1);
  }

  formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onDateChange() {
    // Update dates for all students when date changes
    if (this.students.length > 0) {
      this.saveAllMarks();
    }
  }

  onMarkFocus(event: any) {
    event.target.select();
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
    // Prepare data for export
    const data: any[] = [];
    
    // Header row
    const headers = ['#', 'Student ID', 'Last Name', 'First Name'];
    for (let i = 1; i <= this.visibleTests; i++) {
      headers.push(`Test ${i}`);
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
    
    // Topic row
    const topicRow = ['', '', 'Topic', ''];
    for (let i = 1; i <= this.visibleTests; i++) {
      const key = `test${i}` as keyof typeof this.topics;
      topicRow.push(this.topics[key] || '—');
    }
    data.push(topicRow);
    
    // Date row
    const dateRow = ['', '', 'Date', ''];
    for (let i = 1; i <= this.visibleTests; i++) {
      const key = `test${i}` as keyof typeof this.testDates;
      dateRow.push(this.testDates[key] || '—');
    }
    data.push(dateRow);
    
    // Convert to CSV
    const csv = data.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const className = this.selectedClass?.name || 'Class';
    const subjectName = this.selectedSubject?.name || 'Subject';
    link.download = `RecordBook_${className}_${subjectName}_${this.currentTerm}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    
    this.success = 'Record book exported successfully!';
    setTimeout(() => this.success = '', 3000);
  }

  printRecordBook() {
    window.print();
  }

  calculateStatistics() {
    const stats = {
      totalStudents: this.students.length,
      totalTests: this.visibleTests,
      completedMarks: this.getCompletedCount(),
      pendingMarks: this.getPendingCount(),
      averageScore: this.getAverageScore(),
      highestScore: 0,
      lowestScore: 100
    };
    
    // Calculate highest and lowest scores
    for (const student of this.students) {
      for (let i = 1; i <= this.visibleTests; i++) {
        const mark = student[`test${i}`];
        if (mark !== null && mark !== '' && mark !== undefined) {
          const numMark = parseFloat(mark);
          if (numMark > stats.highestScore) stats.highestScore = numMark;
          if (numMark < stats.lowestScore) stats.lowestScore = numMark;
        }
      }
    }
    
    const message = `
📊 Record Book Statistics

👥 Total Students: ${stats.totalStudents}
📝 Total Tests: ${stats.totalTests}
✅ Completed Marks: ${stats.completedMarks}
⏳ Pending Marks: ${stats.pendingMarks}
📈 Average Score: ${stats.averageScore}%
🏆 Highest Score: ${stats.highestScore}%
📉 Lowest Score: ${stats.lowestScore === 100 ? 'N/A' : stats.lowestScore + '%'}
    `.trim();
    
    alert(message);
  }
}

