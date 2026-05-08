import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-link-students',
  templateUrl: './link-students.component.html',
  styleUrls: ['./link-students.component.css']
})
export class LinkStudentsComponent implements OnInit {
  studentId = '';
  linkedStudents: any[] = [];
  linking = false;
  loading = false;
  error = '';
  success = '';

  parentName = '';
  pendingUnlinkId: string | null = null;
  pendingUnlinkName = '';

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() {
    this.loadLinkedStudents();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.pendingUnlinkId) {
      this.cancelUnlink();
    }
  }

  get linkedCount(): number {
    return this.linkedStudents.length;
  }

  get canSubmitLink(): boolean {
    return !!this.studentId?.trim() && !this.linking;
  }

  loadLinkedStudents() {
    this.loading = true;
    this.error = '';
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.linkedStudents = response.students || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Please log in again.';
          setTimeout(() => this.authService.logout(), 2000);
        } else {
          this.error = err.error?.message || 'Failed to load linked students';
        }
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  linkStudent() {
    this.error = '';
    this.success = '';

    const id = this.studentId?.trim();
    if (!id) {
      this.error = 'Please enter a Student ID';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    this.linking = true;

    this.parentService.linkStudentByIdAndDob(id).subscribe({
      next: (response: any) => {
        this.linking = false;
        const name = `${response.student?.firstName || ''} ${response.student?.lastName || ''}`.trim();
        this.success = name ? `Linked successfully — ${name}` : 'Student linked successfully.';
        this.studentId = '';
        this.loadLinkedStudents();
        setTimeout(() => (this.success = ''), 6000);
      },
      error: (err: any) => {
        this.linking = false;
        this.error =
          err.error?.message ||
          'Could not link this student. Check the Student ID and that the date of birth on file matches.';
        setTimeout(() => (this.error = ''), 8000);
      }
    });
  }

  requestUnlink(student: any) {
    this.pendingUnlinkId = student.id;
    this.pendingUnlinkName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'this student';
  }

  cancelUnlink() {
    this.pendingUnlinkId = null;
    this.pendingUnlinkName = '';
  }

  confirmUnlink() {
    if (!this.pendingUnlinkId) {
      return;
    }
    const id = this.pendingUnlinkId;
    this.cancelUnlink();

    this.parentService.unlinkStudent(id).subscribe({
      next: () => {
        this.success = 'Student unlinked successfully.';
        this.loadLinkedStudents();
        setTimeout(() => (this.success = ''), 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  initials(student: any): string {
    const a = (student?.firstName || '?').charAt(0);
    const b = (student?.lastName || '').charAt(0);
    return (a + b).toUpperCase();
  }

  refresh() {
    this.loadLinkedStudents();
  }

  goToDashboard() {
    this.router.navigate(['/parent/dashboard']);
  }

  logout() {
    this.authService.logout();
  }
}
