import { Component } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { ModuleAccessService } from '../../../services/module-access.service';

@Component({
  selector: 'app-general-manage',
  templateUrl: './general-manage.component.html',
  styleUrls: ['./general-manage.component.css'],
})
export class GeneralManageComponent {
  constructor(
    private authService: AuthService,
    public moduleAccessService: ModuleAccessService
  ) {}

  showSchoolSettingsTab(): boolean {
    return (
      this.moduleAccessService.canAccessModule('settings') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  showUserManagementTab(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  showDepartmentsTab(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  showParentManagementTab(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  showActivityLogTab(): boolean {
    return this.authService.hasRole('accountant') || this.authService.hasRole('admin');
  }

  showAcademicSettingsTab(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  showSystemSettingsTab(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  showRolesPermissionsTab(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }
}
