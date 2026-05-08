import { Component } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { ModuleAccessService } from '../../../services/module-access.service';

@Component({
  selector: 'app-report-manage',
  templateUrl: './report-manage.component.html',
  styleUrls: ['./report-manage.component.css'],
})
export class ReportManageComponent {
  constructor(
    private authService: AuthService,
    public moduleAccessService: ModuleAccessService
  ) {}

  showAttendanceReportsTab(): boolean {
    return (
      this.moduleAccessService.canAccessModule('attendance') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin')
    );
  }
}
