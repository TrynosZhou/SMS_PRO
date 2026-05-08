import { Component, OnInit } from '@angular/core';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';

@Component({
  selector: 'app-class-lists',
  templateUrl: './class-lists.component.html',
  styleUrls: ['./class-lists.component.css']
})
export class ClassListsComponent implements OnInit {
  classes: any[] = [];
  filteredClasses: any[] = [];
  students: any[] = [];
  filteredStudents: any[] = [];
  paginatedStudents: any[] = [];
  selectedClassId: string = '';
  selectedTerm: string = '';
  availableTerms: string[] = ['Term 1', 'Term 2', 'Term 3'];
  loading = false;
  loadingStudents = false;
  error = '';
  success = '';
  searchQuery = '';
  isTeacher = false;
  teacherClasses: any[] = [];
  pagination = {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [10, 20, 50, 100];
  // School settings
  schoolName: string = 'School Management System';
  schoolLogo: string | null = null;

  // Inline editing (Admin/Accountant)
  showEditModal = false;
  editSaving = false;
  editError = '';
  editingStudent: any = null;
  editingFieldKey: string = '';
  editingFieldLabel: string = '';
  editValue: any = '';
  editInputType: 'text' | 'date' | 'select' = 'text';
  editSelectOptions: string[] = [];

  constructor(
    private classService: ClassService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private teacherService: TeacherService
  ) { }

  ngOnInit() {
    this.isTeacher = this.authService.hasRole('teacher');
    this.loadClasses();
    this.loadActiveTerm();
    this.loadSettings();
  }

  private canEditClassListRecords(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  private toDateInputValue(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  }

  private normalizeGenderForDropdown(value: any): string {
    const raw = String(value ?? '').trim();
    const lower = raw.toLowerCase();
    if (!raw) return '';
    if (lower === 'f' || lower === 'female') return 'Female';
    if (lower === 'm' || lower === 'male') return 'Male';
    // Keep unknown gender as-is so it's not lost.
    return raw;
  }

  openEditModal(student: any, fieldKey: string): void {
    if (!this.canEditClassListRecords()) return;
    if (!student?.id) return;

    this.editError = '';
    this.editSaving = false;
    this.showEditModal = true;
    this.editingStudent = student;
    this.editingFieldKey = fieldKey;

    // Configure modal field
    switch (fieldKey) {
      case 'firstName':
        this.editingFieldLabel = 'First Name';
        this.editInputType = 'text';
        this.editValue = student.firstName || '';
        this.editSelectOptions = [];
        break;
      case 'lastName':
        this.editingFieldLabel = 'Last Name';
        this.editInputType = 'text';
        this.editValue = student.lastName || '';
        this.editSelectOptions = [];
        break;
      case 'gender':
        this.editingFieldLabel = 'Gender';
        this.editInputType = 'select';
        this.editValue = this.normalizeGenderForDropdown(student.gender);
        // Ensure current value is present in options to avoid blank display.
        this.editSelectOptions = ['Female', 'Male'];
        if (this.editValue && !this.editSelectOptions.includes(this.editValue)) {
          this.editSelectOptions = [this.editValue, ...this.editSelectOptions];
        }
        break;
      case 'dateOfBirth':
        this.editingFieldLabel = 'Date of Birth';
        this.editInputType = 'date';
        this.editValue = this.toDateInputValue(student.dateOfBirth);
        this.editSelectOptions = [];
        break;
      case 'studentType':
        this.editingFieldLabel = 'Student Type';
        this.editInputType = 'select';
        this.editValue = student.studentType || 'Day Scholar';
        this.editSelectOptions = ['Day Scholar', 'Boarder'];
        break;
      case 'contactNumber':
        this.editingFieldLabel = 'Contact Number';
        this.editInputType = 'text';
        this.editValue = student.contactNumber || student.phoneNumber || '';
        this.editSelectOptions = [];
        break;
      default:
        // Unsupported field
        this.editError = 'This field cannot be edited.';
        break;
    }
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editSaving = false;
    this.editError = '';
    this.editingStudent = null;
    this.editingFieldKey = '';
    this.editValue = '';
    this.editInputType = 'text';
    this.editSelectOptions = [];
  }

  saveEdit(): void {
    if (!this.editingStudent?.id) return;
    if (!this.editingFieldKey) return;

    this.editSaving = true;
    this.editError = '';

    const payload: any = {};
    switch (this.editingFieldKey) {
      case 'firstName':
        payload.firstName = this.editValue;
        break;
      case 'lastName':
        payload.lastName = this.editValue;
        break;
      case 'gender':
        payload.gender = this.editValue;
        break;
      case 'dateOfBirth':
        payload.dateOfBirth = this.editValue; // YYYY-MM-DD (from <input type="date">)
        break;
      case 'studentType':
        payload.studentType = this.editValue;
        break;
      case 'contactNumber':
        payload.contactNumber = this.editValue;
        break;
      default:
        this.editSaving = false;
        this.editError = 'This field cannot be edited.';
        return;
    }

    this.studentService.updateStudent(this.editingStudent.id, payload).subscribe({
      next: () => {
        this.editSaving = false;
        this.showEditModal = false;
        this.success = 'Record updated successfully';
        setTimeout(() => (this.success = ''), 5000);
        // Reload list and keep current search query
        this.loadClassList();
      },
      error: (err: any) => {
        this.editSaving = false;
        this.editError = err?.error?.message || err?.message || 'Failed to update record';
      }
    });
  }

  loadClasses() {
    this.loading = true;
    this.error = '';

    if (this.isTeacher) {
      // For teachers, load only their assigned classes
      this.teacherService.getCurrentTeacher().subscribe({
        next: (teacher: any) => {
          if (teacher?.id) {
            this.teacherService.getTeacherClasses(teacher.id).subscribe({
              next: (response: any) => {
                const classesList = response.classes || [];
                this.classes = this.classService.sortClasses(classesList);
                this.filteredClasses = [...this.classes];
                this.loading = false;
              },
              error: (err: any) => {
                console.error('Error loading teacher classes:', err);
                this.error = 'Failed to load classes';
                this.loading = false;
              }
            });
          } else {
            this.error = 'Teacher information not found';
            this.loading = false;
          }
        },
        error: (err: any) => {
          console.error('Error loading teacher:', err);
          this.error = 'Failed to load teacher information';
          this.loading = false;
        }
      });
    } else {
      // For admins, load all classes
      this.classService.getClasses().subscribe({
        next: (data: any) => {
          let classesList = Array.isArray(data) ? data : (data?.data || []);
          classesList = classesList.filter((c: any) => c.isActive !== false);
          this.classes = this.classService.sortClasses(classesList);
          this.filteredClasses = [...this.classes];
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Error loading classes:', err);
          this.error = 'Failed to load classes';
          this.loading = false;
        }
      });
    }
  }

  loadActiveTerm() {
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.selectedTerm = data.activeTerm;
        } else if (data.currentTerm) {
          this.selectedTerm = data.currentTerm;
        }
        // Extract term number if format is "Term 1 2024" or similar
        if (this.selectedTerm && this.selectedTerm.includes('Term')) {
          const termMatch = this.selectedTerm.match(/Term\s*(\d+)/i);
          if (termMatch) {
            this.selectedTerm = `Term ${termMatch[1]}`;
          }
        }
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
        // Default to Term 1 if unable to load
        if (!this.selectedTerm) {
          this.selectedTerm = 'Term 1';
        }
      }
    });
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        // Handle both array and single object responses
        let settingsData = settings;
        if (Array.isArray(settings) && settings.length > 0) {
          settingsData = settings[0];
        }
        
        if (settingsData) {
          // Get school name
          if (settingsData.schoolName) {
            this.schoolName = settingsData.schoolName;
          }
          
          // Get logo - check both schoolLogo and schoolLogo2
          const logo = settingsData.schoolLogo || settingsData.schoolLogo2;
          if (logo) {
            // Handle base64 data URLs
            if (typeof logo === 'string') {
              if (logo.startsWith('data:image')) {
                this.schoolLogo = logo;
              } else if (logo.startsWith('http://') || logo.startsWith('https://')) {
                this.schoolLogo = logo;
              } else if (logo.length > 100) {
                // Assume it's a base64 string without data URL prefix
                this.schoolLogo = `data:image/png;base64,${logo}`;
              } else {
                // Might be a file path
                this.schoolLogo = logo;
              }
            }
          }
        }
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        // Use default values if settings fail to load
      }
    });
  }

  onClassChange() {
    this.students = [];
    this.filteredStudents = [];
    if (this.selectedClassId && this.selectedTerm) {
      this.loadClassList();
    }
  }

  onTermChange() {
    this.students = [];
    this.filteredStudents = [];
    if (this.selectedClassId && this.selectedTerm) {
      this.loadClassList();
    }
  }

  loadClassList() {
    if (!this.selectedClassId || !this.selectedTerm) {
      this.error = 'Please select both class and term';
      return;
    }

    this.loadingStudents = true;
    this.error = '';
    this.success = '';

    // Get students for the selected class
    // Note: The term filter is informational - students are enrolled in classes regardless of term
    // The term selection helps identify which academic period this list is for
    this.studentService.getStudents({
      classId: this.selectedClassId,
      enrollmentStatus: 'Enrolled'
    }).subscribe({
      next: (data: any) => {
        const studentsList = Array.isArray(data) ? data : (data?.data || []);
        this.students = studentsList.sort((a: any, b: any) => {
          // Group by Gender: Female first, then alphabetically by LastName.
          const genderOrder = (g: any) => {
            const norm = String(g ?? '').trim().toLowerCase();
            if (norm === 'f' || norm === 'female') return 0;
            if (norm === 'm' || norm === 'male') return 1;
            return 2; // unknown/other
          };
          const aGenderRank = genderOrder(a.gender);
          const bGenderRank = genderOrder(b.gender);
          if (aGenderRank !== bGenderRank) return aGenderRank - bGenderRank;

          const aLastName = (a.lastName || '').toLowerCase();
          const bLastName = (b.lastName || '').toLowerCase();
          if (aLastName !== bLastName) return aLastName.localeCompare(bLastName);

          const aFirstName = (a.firstName || '').toLowerCase();
          const bFirstName = (b.firstName || '').toLowerCase();
          return aFirstName.localeCompare(bFirstName);
        });

        // Re-apply search filter and pagination
        this.filterStudents();
        this.loadingStudents = false;
        this.success = `Loaded ${this.students.length} student(s) for ${this.getSelectedClassName()} - ${this.selectedTerm}`;
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error loading class list:', err);
        this.error = err.error?.message || 'Failed to load class list';
        this.loadingStudents = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  getSelectedClassName(): string {
    const selectedClass = this.classes.find(c => c.id === this.selectedClassId);
    return selectedClass ? selectedClass.name : 'Selected Class';
  }

  filterStudents() {
    if (!this.searchQuery.trim()) {
      this.filteredStudents = [...this.students];
    } else {
      const query = this.searchQuery.toLowerCase().trim();
      this.filteredStudents = this.students.filter((s: any) =>
        s.studentNumber?.toLowerCase().includes(query) ||
        s.firstName?.toLowerCase().includes(query) ||
        s.lastName?.toLowerCase().includes(query) ||
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(query) ||
        s.gender?.toLowerCase().includes(query) ||
        s.studentType?.toLowerCase().includes(query)
      );
    }
    this.pagination.total = this.filteredStudents.length;
    this.pagination.totalPages = Math.ceil(this.pagination.total / this.pagination.limit);
    this.pagination.page = 1;
    this.updatePaginatedStudents();
  }

  updatePaginatedStudents() {
    const start = (this.pagination.page - 1) * this.pagination.limit;
    const end = start + this.pagination.limit;
    this.paginatedStudents = this.filteredStudents.slice(start, end);
  }

  changePage(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.pagination.page = page;
    this.updatePaginatedStudents();
    // Scroll to top of table
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  changePageSize(limit: string | number) {
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    if (!parsedLimit || parsedLimit === this.pagination.limit) return;
    this.pagination.limit = parsedLimit;
    this.pagination.totalPages = Math.ceil(this.pagination.total / this.pagination.limit);
    this.pagination.page = 1;
    this.updatePaginatedStudents();
  }

  clearSearch() {
    this.searchQuery = '';
    this.filterStudents();
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  exportToCSV() {
    if (this.filteredStudents.length === 0) {
      this.error = 'No students to export';
      return;
    }

    const selectedClass = this.classes.find(c => c.id === this.selectedClassId);
    const className = selectedClass ? selectedClass.name : 'Class';
    
    // CSV header
    const headers = ['Student Number', 'First Name', 'Last Name', 'Gender', 'Date of Birth', 'Student Type', 'Contact Number'];
    const rows = this.filteredStudents.map((s: any) => [
      s.studentNumber || '',
      s.firstName || '',
      s.lastName || '',
      s.gender || '',
      this.formatDate(s.dateOfBirth),
      s.studentType || '',
      s.contactNumber || s.phoneNumber || ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${className}_${this.selectedTerm}_ClassList.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadPDF() {
    if (!this.selectedClassId || !this.selectedTerm) {
      this.error = 'Please select both class and term to download the class list';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.loadingStudents = true;
    this.error = '';
    this.success = '';

    // Download PDF - backend will fetch students for the selected class and term
    this.studentService.downloadClassListPDF(this.selectedClassId, this.selectedTerm).subscribe({
      next: (blob: Blob) => {
        if (blob.size === 0) {
          this.error = 'Received empty PDF file. The class may have no enrolled students.';
          this.loadingStudents = false;
          setTimeout(() => this.error = '', 5000);
          return;
        }

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const selectedClass = this.classes.find(c => c.id === this.selectedClassId);
        const className = selectedClass ? selectedClass.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Class';
        const termName = this.selectedTerm.replace(/[^a-zA-Z0-9]/g, '_');
        link.download = `${className}_${termName}_ClassList.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        this.loadingStudents = false;
        this.success = `Class list PDF downloaded successfully for ${selectedClass?.name || 'selected class'} - ${this.selectedTerm}`;
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('PDF download error:', err);
        let errorMessage = 'Failed to download PDF';
        
        if (err.status === 400) {
          errorMessage = err.error?.message || 'Invalid request. Please ensure class and term are selected.';
        } else if (err.status === 403) {
          errorMessage = err.error?.message || 'You do not have permission to download this class list.';
        } else if (err.status === 404) {
          errorMessage = err.error?.message || 'Class not found or has no enrolled students.';
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        this.loadingStudents = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}

