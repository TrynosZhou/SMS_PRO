import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { InventoryService } from '../../../services/inventory.service';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';
import { studentsManageNav } from '../students-manage-navigation';

@Component({
  selector: 'app-student-form',
  templateUrl: './student-form.component.html',
  styleUrls: ['./student-form.component.css']
})
export class StudentFormComponent implements OnInit {
  student: any = {
    firstName: '',
    lastName: '',
    nationalId: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    phoneNumber: '',
    contactNumber: '',
    email: '',
    dateOfJoining: '',
    previousSchool: '',
    studentType: 'Day Scholar',
    usesTransport: false,
    usesDiningHall: false,
    isStaffChild: false,
    classId: '',
    parentId: '',
    photo: null
  };
  isEdit = false;
  error = '';
  success = '';
  /** Populated for staff users when editing, via GET /inventory/students/:id/summary */
  inventorySummary: any = null;
  inventorySummaryError = '';
  inventorySummaryLoading = false;
  submitting = false;
  maxDate = '';
  selectedPhoto: File | null = null;
  photoPreview: string | null = null;
  studentIdPrefix = 'JPS';
  /** Fields used for completion % and coarse validation hints (edit mode). */
  readonly requiredFields = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'contactNumber', 'studentType'];

  constructor(
    private studentService: StudentService,
    private settingsService: SettingsService,
    private inventoryService: InventoryService,
    private authService: AuthService,
    private route: ActivatedRoute,
    public router: Router
  ) {
    // Set max date to today (for date of birth)
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];
  }

  ngOnInit() {
    this.loadStudentIdPrefix();
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadStudent(id);
    }
  }

  loadStudentIdPrefix() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        const prefix = typeof settings?.studentIdPrefix === 'string'
          ? settings.studentIdPrefix.trim()
          : '';
        if (prefix) {
          this.studentIdPrefix = prefix.toUpperCase();
        }
      },
      error: (err: any) => {
        console.error('Error loading student ID prefix:', err);
      }
    });
  }

  onStaffChildChange() {
    // If staff child is checked, automatically uncheck transport (staff children don't pay for transport)
    if (this.student.isStaffChild) {
      this.student.usesTransport = false;
    }
  }

  loadStudent(id: string) {
    this.studentService.getStudentById(id).subscribe({
      next: (data: any) => {
        console.log('Loaded student data:', data);
        
        // Format dateOfBirth for HTML date input (YYYY-MM-DD)
        let formattedDate = '';
        if (data.dateOfBirth) {
          const date = new Date(data.dateOfBirth);
          if (!isNaN(date.getTime())) {
            formattedDate = date.toISOString().split('T')[0];
          }
        }
        
        // Get classId - prefer direct classId, then class.id, then empty string
        const studentClassId = data.classId || data.class?.id || '';
        console.log('Setting classId to:', studentClassId);
        
        let formattedJoin = '';
        if (data.dateOfJoining) {
          const jd = new Date(data.dateOfJoining);
          if (!isNaN(jd.getTime())) {
            formattedJoin = jd.toISOString().split('T')[0];
          }
        }

        this.student = {
          ...data,
          dateOfBirth: formattedDate,
          dateOfJoining: formattedJoin,
          nationalId: data.nationalId ?? '',
          email: data.email ?? '',
          previousSchool: data.previousSchool ?? '',
          classId: studentClassId,
          contactNumber: data.contactNumber || data.phoneNumber || '',
          usesTransport: data.usesTransport || false,
          usesDiningHall: data.usesDiningHall || false,
          isStaffChild: data.isStaffChild || false,
          photo: data.photo || null
        };
        
        // Set photo preview if photo exists
        if (data.photo) {
          this.photoPreview = `${environment.serverBaseUrl}${data.photo}`;
          this.student.photo = data.photo;
        }
        console.log('Formatted student data:', this.student);
        this.loadInventorySummaryForProfile(id);
      },
      error: (err: any) => {
        console.error('Error loading student:', err);
        this.error = err.error?.message || 'Failed to load student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.error = 'Please select an image file';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.error = 'Image size must be less than 2MB';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      
      this.selectedPhoto = file;
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.photoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  removePhoto() {
    this.selectedPhoto = null;
    this.photoPreview = null;
    this.student.photo = null;
  }

  private calculateAge(dateString: string): number {
    const dob = new Date(dateString);
    if (isNaN(dob.getTime())) {
      return 0;
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.submitting = true;

    // Validate required fields
    if (this.isEdit) {
      if (
        !this.student.firstName ||
        !this.student.lastName ||
        !this.student.dateOfBirth ||
        !this.student.gender ||
        !this.student.contactNumber ||
        !this.student.studentType
      ) {
        this.error = 'Please fill in all required fields';
        this.submitting = false;
        return;
      }
    } else {
      if (
        !this.student.firstName?.trim() ||
        !this.student.lastName?.trim() ||
        !this.student.nationalId?.trim() ||
        !this.student.dateOfBirth ||
        !this.student.gender ||
        !this.student.contactNumber?.trim() ||
        !this.student.email?.trim() ||
        !this.student.address?.trim() ||
        !this.student.dateOfJoining ||
        !this.student.studentType
      ) {
        this.error = 'Please fill in all required fields';
        this.submitting = false;
        return;
      }
      const em = String(this.student.email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        this.error = 'Please enter a valid email address';
        this.submitting = false;
        return;
      }
    }

    // Class is now optional - students can be enrolled later
    // Validation removed - classId can be empty

    const studentAge = this.calculateAge(this.student.dateOfBirth);
    if (studentAge < 11 || studentAge > 20) {
      this.error = 'Students must be between 11 and 20 years old at registration';
      this.submitting = false;
      return;
    }
    
    if (this.isEdit) {
      // Prepare update data - exclude fields that shouldn't be updated
      const updateData: any = {
        firstName: this.student.firstName,
        lastName: this.student.lastName,
        nationalId: this.student.nationalId?.trim() || null,
        dateOfBirth: this.student.dateOfBirth,
        gender: this.student.gender,
        address: this.student.address || null,
        contactNumber: this.student.contactNumber,
        email: this.student.email?.trim() || null,
        dateOfJoining: this.student.dateOfJoining || null,
        previousSchool: this.student.previousSchool?.trim() || null,
        studentType: this.student.studentType,
        usesTransport: this.student.usesTransport || false,
        usesDiningHall: this.student.usesDiningHall || false,
        isStaffChild: this.student.isStaffChild || false
      };

      // Include phoneNumber if provided
      if (this.student.phoneNumber) {
        updateData.phoneNumber = this.student.phoneNumber;
      }

      // Always include classId if it's set
      if (this.student.classId) {
        updateData.classId = this.student.classId;
      } else {
        updateData.classId = null;
      }

      // Only include parentId if it exists
      if (this.student.parentId) {
        updateData.parentId = this.student.parentId;
      }

      // Include photo path if no new photo is selected but photo exists
      if (!this.selectedPhoto && this.student.photo) {
        updateData.photo = this.student.photo;
      }

      console.log('Updating student with ID:', this.student.id);
      console.log('Update data:', updateData);

      this.studentService.updateStudent(this.student.id, updateData, this.selectedPhoto || undefined).subscribe({
        next: (response: any) => {
          console.log('Student update response:', response);
          this.success = response.message || 'Student updated successfully';
          this.submitting = false;
          setTimeout(() => this.goToStudentsList(), 1500);
        },
        error: (err: any) => {
          console.error('Error updating student:', err);
          this.error = err.error?.message || err.message || 'Failed to update student';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      // For new students, don't send studentNumber (it will be auto-generated).
      // Class is assigned only via Student Manager → Enroll Student.
      const studentData = { ...this.student };
      delete studentData.studentNumber;
      delete studentData.classId;

      this.studentService.createStudent(studentData, this.selectedPhoto || undefined).subscribe({
        next: (response: any) => {
          this.success =
            response.message ||
            'Student registered successfully. Use Enroll Student to place them in a class.';
          this.submitting = false;
          setTimeout(() => this.goToStudentsList(), 1800);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to create student';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }

  getAgePreview(): number | null {
    if (!this.student?.dateOfBirth) {
      return null;
    }
    const age = this.calculateAge(this.student.dateOfBirth);
    return age > 0 ? age : null;
  }

  goToStudentsList(): void {
    if (!this.isEdit && this.router.url.split('?')[0].includes('/students/add-new')) {
      void this.router.navigate(['/students']);
      return;
    }
    this.router.navigateByUrl(studentsManageNav(this.router).list);
  }

  staffCanViewInventoryProfile(): boolean {
    const r = String(this.authService.getCurrentUser()?.role || '').toLowerCase();
    return ['librarian', 'inventory_clerk', 'admin', 'superadmin'].includes(r);
  }

  private loadInventorySummaryForProfile(studentId: string): void {
    this.inventorySummary = null;
    this.inventorySummaryError = '';
    if (!this.isEdit || !this.staffCanViewInventoryProfile() || !studentId) return;
    this.inventorySummaryLoading = true;
    this.inventoryService.studentSummary(studentId).subscribe({
      next: s => {
        this.inventorySummary = s;
        this.inventorySummaryLoading = false;
      },
      error: err => {
        this.inventorySummaryLoading = false;
        this.inventorySummaryError =
          err.error?.message || 'Inventory summary unavailable (check permissions or module migration).';
      },
    });
  }

  getCompletionPercent(): number {
    const completed = this.requiredFields.filter(field => {
      const value = this.student?.[field];
      return value !== null && value !== undefined && String(value).trim() !== '';
    }).length;
    return Math.round((completed / this.requiredFields.length) * 100);
  }

}
