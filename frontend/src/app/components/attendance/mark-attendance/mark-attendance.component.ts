import { Component, OnInit } from '@angular/core';
import { AttendanceService } from '../../../services/attendance.service';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-mark-attendance',
  templateUrl: './mark-attendance.component.html',
  styleUrls: ['./mark-attendance.component.css']
})
export class MarkAttendanceComponent implements OnInit {
  classes: any[] = [];
  students: any[] = [];
  selectedClassId: string = '';
  selectedDate: string = '';
  attendanceData: any[] = [];
  loading = false;
  submitting = false;
  success = '';
  error = '';
  currentTerm: string = '';
  searchQuery: string = '';
  filteredAttendanceData: any[] = [];
  statusFilter: string = 'all'; // 'all', 'present', 'absent', 'late', 'excused'
  hasUnsavedChanges = false;
  lastSavedDate: Date | null = null;

  /** School policy: week runs Sunday -> Saturday, but attendance marking is allowed Mon-Fri only. */
  readonly weekendNotAllowedMessage = 'Attendance can only be marked Monday to Friday (Sundays and Saturdays are not allowed).';

  constructor(
    private attendanceService: AttendanceService,
    private classService: ClassService,
    private studentService: StudentService,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.loadClasses();
    this.loadActiveTerm();
    // Set default date to today
    const today = this.normalizeToAllowedDate(new Date());
    this.selectedDate = this.formatDateToYMD(today);
  }

  get isMarkingAllowed(): boolean {
    if (!this.selectedDate) return true;
    const day = this.getWeekdayFromDateString(this.selectedDate); // Sun=0 ... Sat=6
    return day >= 1 && day <= 5; // Mon-Fri
  }

  private getWeekdayFromDateString(dateStr: string): number {
    // dateStr is expected in YYYY-MM-DD; build a local date to avoid timezone shifts.
    const parts = dateStr.split('-').map((p) => Number(p));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
      return new Date(dateStr).getDay();
    }
    const [y, m, d] = parts;
    return new Date(y, m - 1, d).getDay();
  }

  private formatDateToYMD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private isWeekendDate(date: Date): boolean {
    const day = date.getDay(); // Sun=0, Sat=6
    return day === 0 || day === 6;
  }

  /**
   * Normalize a date to the nearest allowed marking day (Mon-Fri).
   * Sunday -> Monday, Saturday -> Friday.
   */
  private normalizeToAllowedDate(date: Date): Date {
    const dt = new Date(date);
    const day = dt.getDay();
    if (day === 0) dt.setDate(dt.getDate() + 1);
    if (day === 6) dt.setDate(dt.getDate() - 1);
    return dt;
  }

  /**
   * Shift date step-by-step until it lands on Mon-Fri.
   * Direction is used for consistent navigation (e.g., go to Friday when moving back from Sunday).
   */
  private shiftToNextAllowedDate(date: Date, direction: 1 | -1): Date {
    const dt = new Date(date);
    while (this.isWeekendDate(dt)) {
      dt.setDate(dt.getDate() + direction);
    }
    return dt;
  }

  loadActiveTerm() {
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        this.currentTerm = data.activeTerm || data.currentTerm || '';
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        const activeClasses = classesList.filter((c: any) => c.isActive);
        this.classes = this.classService.sortClasses(activeClasses);
      },
      error: (err: any) => {
        this.error = 'Failed to load classes';
        console.error(err);
      }
    });
  }

  onClassChange() {
    if (!this.selectedClassId) {
      this.students = [];
      this.attendanceData = [];
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Load students for the selected class
    this.studentService.getStudents({ classId: this.selectedClassId }).subscribe({
      next: (data: any) => {
        this.students = data.filter((s: any) => s.isActive);
        this.initializeAttendanceData();
        this.loadExistingAttendance();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'Failed to load students';
        this.loading = false;
        console.error(err);
      }
    });
  }

  initializeAttendanceData() {
    this.attendanceData = this.students.map(student => ({
      studentId: student.id,
      status: 'present',
      remarks: ''
    }));
    this.updateFilteredData();
    this.hasUnsavedChanges = false;
  }

  loadExistingAttendance() {
    if (!this.selectedClassId || !this.selectedDate) {
      return;
    }

    this.attendanceService.getAttendance({
      classId: this.selectedClassId,
      date: this.selectedDate
    }).subscribe({
      next: (response: any) => {
        if (response.attendance && response.attendance.length > 0) {
          // Map existing attendance to our data structure
          const existingMap = new Map(
            response.attendance.map((a: any) => [a.studentId, a])
          );
          
          this.attendanceData = this.attendanceData.map(item => {
            const existing = existingMap.get(item.studentId) as any;
            if (existing) {
              return {
                studentId: item.studentId,
                status: existing.status,
                remarks: existing.remarks || ''
              };
            }
            return item;
          });
          this.updateFilteredData();
          this.hasUnsavedChanges = false;
        }
      },
      error: (err: any) => {
        // If no attendance found, that's okay - we'll create new records
        console.log('No existing attendance found for this date');
      }
    });
  }

  onDateChange() {
    if (this.selectedClassId && this.selectedDate) {
      this.hasUnsavedChanges = false;
      this.lastSavedDate = null;
      this.success = '';
      // error is shown via the warning banner; keep it quiet during navigation
      this.error = '';
      this.loadExistingAttendance();
    }
  }

  getStudentName(studentId: string): string {
    const student = this.students.find(s => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : '';
  }

  getStudentNumber(studentId: string): string {
    const student = this.students.find(s => s.id === studentId);
    return student ? student.studentNumber : '';
  }

  markAll(status: string) {
    if (!this.isMarkingAllowed) {
      this.error = this.weekendNotAllowedMessage;
      setTimeout(() => (this.error = ''), 4000);
      return;
    }
    this.attendanceData.forEach(item => {
      item.status = status;
    });
    this.hasUnsavedChanges = true;
    this.updateFilteredData();
  }

  submitAttendance() {
    if (!this.selectedClassId || !this.selectedDate) {
      this.error = 'Please select a class and date';
      return;
    }

    if (!this.isMarkingAllowed) {
      this.error = this.weekendNotAllowedMessage;
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    if (this.attendanceData.length === 0) {
      this.error = 'No students to mark attendance for';
      return;
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    this.attendanceService.markAttendance(
      this.selectedClassId,
      this.selectedDate,
      this.attendanceData
    ).subscribe({
      next: (response: any) => {
        this.success = response.message || 'Attendance marked successfully!';
        this.submitting = false;
        this.hasUnsavedChanges = false;
        this.lastSavedDate = new Date();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to mark attendance';
        this.submitting = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  // Statistics
  getStatistics() {
    const stats = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      total: this.attendanceData.length
    };
    
    this.attendanceData.forEach(item => {
      if (item.status === 'present') stats.present++;
      else if (item.status === 'absent') stats.absent++;
      else if (item.status === 'late') stats.late++;
      else if (item.status === 'excused') stats.excused++;
    });
    
    return stats;
  }

  getAttendanceRate(): number {
    const stats = this.getStatistics();
    if (stats.total === 0) return 0;
    return Math.round(((stats.present + stats.excused) / stats.total) * 100);
  }

  // Search and Filter
  onSearchChange() {
    this.updateFilteredData();
  }

  onStatusFilterChange() {
    this.updateFilteredData();
  }

  updateFilteredData() {
    let filtered = [...this.attendanceData];

    // Apply search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const name = this.getStudentName(item.studentId).toLowerCase();
        const number = this.getStudentNumber(item.studentId).toLowerCase();
        return name.includes(query) || number.includes(query);
      });
    }

    // Apply status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === this.statusFilter);
    }

    this.filteredAttendanceData = filtered;
  }

  // Quick status update
  updateStatus(studentId: string, status: string) {
    if (!this.isMarkingAllowed) return;
    const item = this.attendanceData.find(a => a.studentId === studentId);
    if (item) {
      item.status = status;
      this.hasUnsavedChanges = true;
      this.updateFilteredData();
    }
  }

  // Date navigation
  navigateDate(days: number) {
    const direction: 1 | -1 = days >= 0 ? 1 : -1;
    const currentDate = new Date(this.selectedDate + 'T00:00:00');
    currentDate.setDate(currentDate.getDate() + days);
    const allowedDate = this.shiftToNextAllowedDate(currentDate, direction);
    this.selectedDate = this.formatDateToYMD(allowedDate);
    this.onDateChange();
  }

  goToToday() {
    const today = this.normalizeToAllowedDate(new Date());
    this.selectedDate = this.formatDateToYMD(today);
    this.onDateChange();
  }

  goToYesterday() {
    this.navigateDate(-1);
  }

  goToTomorrow() {
    this.navigateDate(1);
  }

  // Check if date is today
  isToday(): boolean {
    return this.selectedDate === this.formatDateToYMD(new Date());
  }

  // Check if date is in the past
  isPastDate(): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(this.selectedDate);
    selected.setHours(0, 0, 0, 0);
    return selected < today;
  }

  // Format date for display
  getFormattedDate(): string {
    if (!this.selectedDate) return '';
    const date = new Date(this.selectedDate);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  // Clear search
  clearSearch() {
    this.searchQuery = '';
    this.updateFilteredData();
  }

  // Clear status filter
  clearStatusFilter() {
    this.statusFilter = 'all';
    this.updateFilteredData();
  }
}

