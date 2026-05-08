import { Component, OnInit } from '@angular/core';
import { toDataURL, type QRCodeToDataURLOptions } from 'qrcode';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-student-id-cards',
  templateUrl: './student-id-cards.component.html',
  styleUrls: ['./student-id-cards.component.css']
})
export class StudentIdCardsComponent implements OnInit {
  classes: any[] = [];
  students: any[] = [];
  selectedClassId: string = '';
  selectedClassName: string = '';
  loading = false;
  error = '';
  schoolName = '';
  schoolLogo: string | null = null;
  schoolPhone = '';
  schoolEmail = '';
  currentYear = '';
  /** Which PDF action is running (for button labels) */
  pdfBusy: null | 'print' | 'download' = null;
  pdfError = '';

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private settingsService: SettingsService
  ) { }

  ngOnInit() {
    this.loadSettings();
    this.loadClasses();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.schoolName = data.schoolName || 'School';
        this.schoolLogo = data.schoolLogo || null;
        this.schoolPhone = data.schoolPhone || '';
        this.schoolEmail = data.schoolEmail || '';
        if (data.academicYear) {
          this.currentYear = data.academicYear;
        } else {
          this.currentYear = new Date().getFullYear().toString();
        }
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.schoolName = 'School';
        this.currentYear = new Date().getFullYear().toString();
      }
    });
  }

  formatDate(date: Date | string | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  getStudentContact(student: any): string {
    return student.contactNumber || student.phoneNumber || '';
  }

  getStudentPhotoUrl(student: any): string | null {
    if (!student || !student.photo) {
      return null;
    }
    
    try {
      // Photo paths are like /uploads/students/filename.jpg
      // The backend serves static files at /uploads/students (not under /api)
      // Extract base URL from environment (e.g., http://localhost:3007 from http://localhost:3007/api)
      let baseUrl = environment.apiUrl.replace('/api', '');
      
      // Ensure baseUrl doesn't end with a slash
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
      }
      
      // Ensure photo path starts with /
      let photoPath = String(student.photo).trim();
      if (!photoPath.startsWith('/')) {
        photoPath = '/' + photoPath;
      }
      
      // Construct full URL
      const photoUrl = baseUrl + photoPath;
      
      // Validate URL format
      try {
        new URL(photoUrl); // This will throw if URL is invalid
        return photoUrl;
      } catch (urlError) {
        console.error('Invalid photo URL constructed:', photoUrl, 'Error:', urlError);
        return null;
      }
    } catch (error) {
      console.error('Error constructing photo URL:', error, 'Student photo:', student.photo);
      return null;
    }
  }

  shouldShowPlaceholder(student: any): boolean {
    // Show placeholder if no photo URL or if photo failed to load
    const hasPhotoUrl = !!(student as any)?.photoUrl;
    const photoLoadError = (student as any)?.photoLoadError === true;
    
    // Show placeholder only if: no URL OR error occurred
    // Don't wait for photo to load - let the image show when it loads
    return !hasPhotoUrl || photoLoadError;
  }

  onPhotoError(event: any, student: any): void {
    // Mark that photo failed to load
    const img = event.target;
    const failedUrl = img?.src;
    
    console.error('Photo failed to load:', {
      student: student?.firstName + ' ' + student?.lastName,
      photoPath: student?.photo,
      attemptedUrl: failedUrl,
      error: 'Image load failed'
    });
    
    if (student) {
      (student as any).photoLoadError = true;
      (student as any).photoLoaded = false;
    }
    // Hide the image
    if (img) {
      img.style.display = 'none';
    }
  }

  onPhotoLoad(event: any, student: any): void {
    // Mark that photo loaded successfully
    if (student) {
      (student as any).photoLoaded = true;
      (student as any).photoLoadError = false;
    }
    // Ensure the image is visible
    const img = event.target;
    if (img) {
      img.style.display = 'block';
    }
  }

  loadClasses() {
    this.loading = true;
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        this.classes = this.classService.sortClasses(classesList);
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'Failed to load classes';
        this.loading = false;
        console.error('Error loading classes:', err);
      }
    });
  }

  onClassChange() {
    if (!this.selectedClassId) {
      this.students = [];
      this.selectedClassName = '';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Find the selected class name
    const selectedClass = this.classes.find(c => c.id === this.selectedClassId);
    this.selectedClassName = selectedClass ? (selectedClass.name || selectedClass.form || '') : '';

    // Load students for the selected class
    this.studentService.getStudents({ classId: this.selectedClassId }).subscribe({
      next: (data: any) => {
        // Filter only active students
        this.students = Array.isArray(data) ? data.filter((s: any) => s.isActive) : [];
        // Initialize photo load states and pre-compute photo URLs for each student
        this.students.forEach((student: any) => {
          student.photoLoaded = false;
          student.photoLoadError = false;
          student.qrDataUrl = null as string | null;
          student.photoUrl = this.getStudentPhotoUrl(student);
          if (student.photo) {
            console.log(`Student ${student.firstName} ${student.lastName}:`, {
              photoPath: student.photo,
              constructedUrl: student.photoUrl
            });
          }
        });
        void this.attachQrCodesToStudents(this.students).finally(() => {
          this.loading = false;
        });
      },
      error: (err: any) => {
        this.error = 'Failed to load students';
        this.loading = false;
        console.error('Error loading students:', err);
      }
    });
  }

  printIdCards() {
    if (!this.selectedClassId || this.students.length === 0 || this.pdfBusy) {
      return;
    }
    this.pdfError = '';
    this.pdfBusy = 'print';
    this.studentService.getClassStudentIdCardsPdf(this.selectedClassId, { download: false }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win) {
          this.pdfError = 'Pop-up blocked. Allow pop-ups to open the PDF print preview, or use Download PDF.';
        }
        setTimeout(() => URL.revokeObjectURL(url), 120000);
        this.pdfBusy = null;
      },
      error: (err: any) => {
        this.pdfBusy = null;
        this.pdfError = err?.error?.message || err?.message || 'Could not open PDF for printing.';
        setTimeout(() => (this.pdfError = ''), 8000);
      }
    });
  }

  downloadPDF() {
    if (!this.selectedClassId || this.students.length === 0 || this.pdfBusy) {
      return;
    }
    this.pdfError = '';
    this.pdfBusy = 'download';
    this.studentService.getClassStudentIdCardsPdf(this.selectedClassId, { download: true }).subscribe({
      next: (blob) => {
        const base = this.sanitizeFileName(this.selectedClassName || 'class');
        const filename = `${base}-student-id-cards.pdf`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.pdfBusy = null;
      },
      error: (err: any) => {
        this.pdfBusy = null;
        this.pdfError = err?.error?.message || err?.message || 'Could not download PDF.';
        setTimeout(() => (this.pdfError = ''), 8000);
      }
    });
  }

  private sanitizeFileName(name: string): string {
    const s = String(name || 'class').trim() || 'class';
    return s.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_|_$/g, '') || 'class';
  }

  /** Same payload shape as backend ID-card PDF (scannable matrix on the grid preview). */
  private async attachQrCodesToStudents(students: any[]): Promise<void> {
    const opts: QRCodeToDataURLOptions = {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      width: 200,
      color: { dark: '#000000', light: '#ffffff' }
    };
    await Promise.all(
      students.map(async (student) => {
        try {
          const className =
            this.selectedClassName ||
            student.class?.name ||
            student.class?.form ||
            student.classEntity?.name ||
            null;
          const payload = {
            studentId: student.id,
            studentNumber: student.studentNumber,
            name: `${student.firstName} ${student.lastName}`.trim(),
            class: className,
            studentType: student.studentType,
            issuedAt: new Date().toISOString()
          };
          student.qrDataUrl = await toDataURL(JSON.stringify(payload), opts);
        } catch (e) {
          console.error('Failed to generate preview QR for student', student?.id, e);
          student.qrDataUrl = null;
        }
      })
    );
  }
}

