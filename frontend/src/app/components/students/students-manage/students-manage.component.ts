import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ModuleAccessService } from '../../../services/module-access.service';

@Component({
  selector: 'app-students-manage',
  templateUrl: './students-manage.component.html',
  styleUrls: ['./students-manage.component.css'],
})
export class StudentsManageComponent {
  constructor(
    public authService: AuthService,
    public moduleAccessService: ModuleAccessService,
    public router: Router
  ) {}

  /** Active for Students list and edit student (add student is its own route). */
  isStudentsSectionActive(): boolean {
    const u = this.router.url.split('?')[0];
    return u === '/students' || u.includes('/students/manage/edit');
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

  showTransferTab(): boolean {
    return this.isAdmin();
  }

  showPromoteTab(): boolean {
    return this.isAdmin();
  }

  /** Hide shell header and tabs on full-page add-student flow. */
  showManageTabs(): boolean {
    const p = this.router.url.split('?')[0].replace(/\/+$/, '');
    return !p.endsWith('/students/manage/add-new');
  }
}
