import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-student-report-card',
  templateUrl: './student-report-card.component.html',
  styleUrls: ['./student-report-card.component.css']
})
export class StudentReportCardComponent implements OnInit {
  reportCard: any = null;
  loading = false;
  error = '';
  /** Set when API returns 403 due to outstanding term invoice balance */
  accessLocked = false;
  studentName = '';
  studentNumber = '';
  activeTerm = '';
  schoolName = '';
  schoolLogo: string | null = null;
  schoolAddress = '';
  schoolPhone = '';
  academicYear = '';

  constructor(
    private authService: AuthService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.student) {
      this.studentName = `${user.student.firstName || ''} ${user.student.lastName || ''}`.trim() || 'Student';
      this.studentNumber = user.student.studentNumber || '';
    }
  }

  ngOnInit() {
    // Verify user is a student
    const user = this.authService.getCurrentUser();
    if (!user || user.role !== 'student') {
      this.authService.logout();
      this.router.navigate(['/login']);
      return;
    }

    this.loadSettings();
    this.loadReportCard();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.schoolName = settings?.schoolName || 'School Management System';
        this.schoolAddress = settings?.schoolAddress || '';
        this.schoolPhone = settings?.schoolPhone || '';
        this.academicYear = settings?.academicYear || '';
        
        // Handle school logos
        if (settings?.schoolLogo) {
          if (settings.schoolLogo.startsWith('data:image')) {
            this.schoolLogo = settings.schoolLogo;
          } else if (settings.schoolLogo.startsWith('http://') || settings.schoolLogo.startsWith('https://')) {
            this.schoolLogo = settings.schoolLogo;
          } else {
            // Assume it's a base64 string without prefix
            this.schoolLogo = `data:image/png;base64,${settings.schoolLogo}`;
          }
        }
      },
      error: (err) => {
        console.error('[StudentReportCard] Error loading settings:', err);
        // Use defaults if settings fail to load
        this.schoolName = 'School Management System';
      }
    });
  }

  loadReportCard() {
    // Verify user is authenticated and is a student
    const user = this.authService.getCurrentUser();
    if (!user || user.role !== 'student') {
      this.error = 'Access denied. Student access required.';
      setTimeout(() => {
        this.authService.logout();
        this.router.navigate(['/login']);
      }, 2000);
      return;
    }

    this.loading = true;
    this.error = '';
    this.accessLocked = false;

    console.log('[StudentReportCard] Loading report card for student:', user.student?.studentNumber || user.id);
    
    this.studentService.getStudentReportCard().subscribe({
      next: (response: any) => {
        console.log('[StudentReportCard] Report card response received:', response);
        console.log('[StudentReportCard] Response keys:', Object.keys(response || {}));
        console.log('[StudentReportCard] Response.reportCard:', response?.reportCard);
        console.log('[StudentReportCard] Response.subjects:', response?.subjects);
        console.log('[StudentReportCard] Response.reportCard?.subjects:', response?.reportCard?.subjects);
        this.loading = false;
        
        // Handle different response structures
        if (response) {
          // Check if reportCard is directly in response or nested
          const reportCardData = response.reportCard || response;
          
          console.log('[StudentReportCard] Report card data:', reportCardData);
          console.log('[StudentReportCard] Report card data keys:', Object.keys(reportCardData || {}));
          console.log('[StudentReportCard] Report card data.subjects:', reportCardData?.subjects);
          console.log('[StudentReportCard] Report card data.subjects type:', typeof reportCardData?.subjects);
          console.log('[StudentReportCard] Report card data.subjects length:', reportCardData?.subjects?.length);
          
          if (reportCardData && (reportCardData.student || reportCardData.subjects)) {
            this.reportCard = reportCardData;
            this.activeTerm = response.term || reportCardData.term || '';
            
            // Update settings from report card if available (backend may have more recent settings)
            if (reportCardData.settings) {
              this.schoolName = reportCardData.settings.schoolName || this.schoolName;
              this.schoolAddress = reportCardData.settings.schoolAddress || this.schoolAddress;
              this.schoolPhone = reportCardData.settings.schoolPhone || this.schoolPhone;
              this.academicYear = reportCardData.settings.academicYear || this.academicYear;
              
              if (reportCardData.settings.schoolLogo) {
                if (reportCardData.settings.schoolLogo.startsWith('data:image')) {
                  this.schoolLogo = reportCardData.settings.schoolLogo;
                } else {
                  this.schoolLogo = `data:image/png;base64,${reportCardData.settings.schoolLogo}`;
                }
              }
              
            }
            
            console.log('[StudentReportCard] Report card loaded successfully:', {
              student: this.reportCard.student?.studentNumber || this.reportCard.student?.id,
              term: this.activeTerm,
              subjectsCount: this.reportCard.subjects?.length || 0,
              subjectsArray: this.reportCard.subjects,
              hasRemarks: !!(this.reportCard.remarks?.classTeacherRemarks || this.reportCard.remarks?.headmasterRemarks),
              hasSchoolInfo: !!this.schoolName
            });
            
            // Log subjects data for debugging
            if (this.reportCard.subjects && Array.isArray(this.reportCard.subjects) && this.reportCard.subjects.length > 0) {
              console.log('[StudentReportCard] Subjects data:', this.reportCard.subjects.map((s: any) => ({
                name: s.name,
                code: s.code,
                score: s.score,
                grade: s.grade,
                comment: s.comment
              })));
            } else {
              console.warn('[StudentReportCard] No subjects found in report card!', {
                reportCard: this.reportCard,
                classId: this.reportCard.student?.classId,
                className: this.reportCard.student?.class,
                subjectsValue: this.reportCard.subjects,
                subjectsType: typeof this.reportCard.subjects,
                isArray: Array.isArray(this.reportCard.subjects),
                subjectsLength: this.reportCard.subjects?.length
              });
            }
          } else {
            console.warn('[StudentReportCard] Invalid report card structure:', response);
            this.error = 'Report card data format is invalid';
          }
        } else {
          console.warn('[StudentReportCard] Empty response received');
          this.error = 'No report card found for the active term';
        }
      },
      error: (err: any) => {
        console.error('[StudentReportCard] Error loading report card:', err);
        this.loading = false;

        // Term balance lock: do not log the user out
        if (err.status === 403) {
          this.accessLocked = true;
          this.error =
            err.error?.message ||
            'Report card is locked until the current term invoice balance is cleared.';
          return;
        }

        if (err.status === 401) {
          this.error = err.error?.message || 'Authentication required. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
            this.router.navigate(['/login']);
          }, 2000);
        } else if (err.status === 404) {
          this.error = err.error?.message || 'No report card found for the active term';
        } else if (err.status === 500) {
          this.error = err.error?.message || 'Server error. Please try again later.';
        } else {
          this.error = err.error?.message || err.message || 'Failed to load report card. Please try again.';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  downloadPDF() {
    if (!this.reportCard || !this.reportCard.student) {
      this.error = 'Report card data not available';
      return;
    }

    this.loading = true;
    this.error = '';

    this.studentService.downloadStudentReportCardPDF().subscribe({
      next: (blob: Blob) => {
        this.loading = false;
        if (blob.size === 0) {
          this.error = 'Received empty PDF file';
          return;
        }
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const studentName = this.studentName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
        const term = this.activeTerm.replace(/\s+/g, '-');
        link.download = `${studentName}-ReportCard-${term}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: (err: any) => {
        this.loading = false;
        console.error('[StudentReportCard] PDF download error:', err);
        this.error = err.error?.message || err.message || 'Failed to download PDF';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  goBack() {
    this.router.navigate(['/student/dashboard']);
  }

  getGradeClass(grade: string | null | undefined): string {
    if (!grade) {
      return 'grade-na';
    }
    // Convert grade to lowercase and replace spaces with hyphens
    const gradeClass = grade.toLowerCase().replace(/\s+/g, '-');
    return `grade-${gradeClass}`;
  }

  roundValue(value: number | null | undefined): number | string {
    if (value === null || value === undefined || isNaN(value)) {
      return 'N/A';
    }
    return Math.round(value);
  }
}
