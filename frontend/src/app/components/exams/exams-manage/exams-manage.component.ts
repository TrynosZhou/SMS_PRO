import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ModuleAccessService } from '../../../services/module-access.service';

@Component({
  selector: 'app-exams-manage',
  templateUrl: './exams-manage.component.html',
  styleUrls: ['./exams-manage.component.css'],
})
export class ExamsManageComponent {
  constructor(
    public router: Router,
    private authService: AuthService,
    public moduleAccessService: ModuleAccessService
  ) {}

  /** Active for exam list, new exam, and marks entry. */
  isMarksCapturingSectionActive(): boolean {
    const u = this.router.url.split('?')[0];
    return (
      u.includes('/exams/manage/marks-capturing') ||
      u.includes('/exams/manage/new') ||
      /\/exams\/manage\/[^/]+\/marks$/.test(u)
    );
  }

  showExamsTabs(): boolean {
    return (
      this.moduleAccessService.canAccessModule('exams') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin')
    );
  }

  showRankingsTab(): boolean {
    return (
      this.moduleAccessService.canAccessModule('rankings') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin')
    );
  }

  showReportCardsTab(): boolean {
    return (
      this.moduleAccessService.canAccessModule('reportCards') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin')
    );
  }

  showResultsAnalysisTab(): boolean {
    return (
      this.authService.hasRole('teacher') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin')
    );
  }

  showAdminExamTabs(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }
}
