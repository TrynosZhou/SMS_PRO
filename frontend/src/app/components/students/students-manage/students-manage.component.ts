import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ModuleAccessService } from '../../../services/module-access.service';
import { StudentManageShellService } from '../../../services/student-manage-shell.service';

@Component({
  selector: 'app-students-manage',
  templateUrl: './students-manage.component.html',
  styleUrls: ['./students-manage.component.css'],
})
export class StudentsManageComponent implements OnInit, OnDestroy {
  showAddStudentModal = false;
  private shellSub?: Subscription;

  constructor(
    public authService: AuthService,
    public moduleAccessService: ModuleAccessService,
    public router: Router,
    private readonly shell: StudentManageShellService
  ) {}

  ngOnInit(): void {
    this.shellSub = this.shell.addStudentModal$.subscribe(() => this.openAddStudentModal());
  }

  ngOnDestroy(): void {
    this.shellSub?.unsubscribe();
    document.body.classList.remove('sm-modal-open');
  }

  openAddStudentModal(): void {
    this.showAddStudentModal = true;
    document.body.classList.add('sm-modal-open');
  }

  closeAddStudentModal(): void {
    this.showAddStudentModal = false;
    document.body.classList.remove('sm-modal-open');
  }

  onAddNewTabClick(event: Event): void {
    event.preventDefault();
    this.openAddStudentModal();
  }

  onAddModalBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('sm-modal-backdrop')) {
      this.closeAddStudentModal();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showAddStudentModal) {
      this.closeAddStudentModal();
    }
  }

  /** Active for Students list and Add/Edit student (record lives under Students). */
  isStudentsSectionActive(): boolean {
    const u = this.router.url.split('?')[0];
    return (
      u === '/students' ||
      u.includes('/students/manage/edit')
    );
  }

  isAdmin(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  showAddNewTab(): boolean {
    return this.isAdmin();
  }

  showStudentsTab(): boolean {
    return this.moduleAccessService.canAccessModule('students') || this.isAdmin();
  }

  canEnrollStudents(): boolean {
    return (
      this.authService.hasRole('teacher') ||
      this.isAdmin() ||
      this.authService.hasRole('accountant')
    );
  }

  isAddNewTabActive(): boolean {
    return this.showAddStudentModal;
  }

  showTransferTab(): boolean {
    return this.isAdmin();
  }

  showPromoteTab(): boolean {
    return this.isAdmin();
  }
}
