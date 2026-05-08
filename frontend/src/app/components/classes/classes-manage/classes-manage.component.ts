import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ModuleAccessService } from '../../../services/module-access.service';

@Component({
  selector: 'app-classes-manage',
  templateUrl: './classes-manage.component.html',
  styleUrls: ['./classes-manage.component.css'],
})
export class ClassesManageComponent {
  constructor(
    public router: Router,
    private authService: AuthService,
    public moduleAccessService: ModuleAccessService
  ) {}

  /** Active for Manage Classes list and add/edit class forms. */
  isManageClassesSectionActive(): boolean {
    const u = this.router.url.split('?')[0];
    return (
      u.includes('/classes/manage/classes') ||
      u.includes('/classes/manage/add-new') ||
      u.includes('/classes/manage/edit')
    );
  }

  showManageClassesTab(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  showClassListsTab(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('teacher')
    );
  }

  showAttendanceTabs(): boolean {
    return (
      this.moduleAccessService.canAccessModule('attendance') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin')
    );
  }

  /** Class ↔ teacher overview — same audience as class lists. */
  showClassTeachersTab(): boolean {
    return this.showClassListsTab();
  }

  /** Timetable-style teacher ↔ subject assignments per class. */
  showAssignTeachersTab(): boolean {
    return this.showManageClassesTab();
  }
}
