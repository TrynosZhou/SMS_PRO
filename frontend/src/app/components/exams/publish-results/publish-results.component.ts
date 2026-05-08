import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-publish-results',
  templateUrl: './publish-results.component.html',
  styleUrls: ['./publish-results.component.css']
})
export class PublishResultsComponent implements OnInit {
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End Term' }
  ];

  publishExamType = '';
  publishTerm = '';
  publishing = false;
  unpublishing = false;
  loadingTerm = false;
  error = '';
  success = '';
  isAdmin = false;

  constructor(
    private examService: ExamService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private route: ActivatedRoute
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin' || user.role === 'superadmin') : false;
  }

  ngOnInit() {
    // Optional pre-fill from /exams screen
    this.route.queryParams.subscribe((params: any) => {
      if (params?.examType) this.publishExamType = params.examType;
      if (params?.term) this.publishTerm = params.term;
    });
    this.loadActiveTerm();
  }

  loadActiveTerm() {
    // If a term was provided via query params, don't override it.
    if (this.publishTerm) {
      return;
    }
    this.loadingTerm = true;
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.publishTerm = data.activeTerm;
        } else if (data.currentTerm) {
          this.publishTerm = data.currentTerm;
        }
        this.loadingTerm = false;
      },
      error: (err: any) => {
        console.error('Error loading active term for publish:', err);
        this.loadingTerm = false;
      }
    });
  }

  publishResults() {
    // For publishing, only exam type and term are required
    if (!this.publishExamType) {
      this.error = 'Please select an exam type to publish results.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (!this.publishTerm) {
      this.error = 'Term is required. Please ensure the active term is set in settings.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (!confirm(`Are you sure you want to publish all ${this.examTypes.find(t => t.value === this.publishExamType)?.label || this.publishExamType} results for ${this.publishTerm}? Once published, results will be visible to all users (students, parents, and teachers) and marks/comments cannot be edited.`)) {
      return;
    }

    this.publishing = true;
    this.error = '';
    this.success = '';

    // Publish by exam type and term (all classes)
    this.examService.publishExamByType(this.publishExamType, this.publishTerm).subscribe({
      next: (response: any) => {
        this.success = `Results published successfully! ${response.publishedCount || 0} exam(s) published. All users (students, parents, and teachers) can now view the results.`;
        this.publishing = false;
        setTimeout(() => this.success = '', 8000);
      },
      error: (err: any) => {
        console.error('Error publishing exam:', err);
        this.error = err.error?.message || 'Failed to publish results. Please try again.';
        this.publishing = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  unpublishResults() {
    if (!this.publishExamType) {
      this.error = 'Please select an exam type to unpublish results.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    if (!this.publishTerm) {
      this.error = 'Term is required. Please ensure the active term is set in settings.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    if (
      !confirm(
        `Are you sure you want to UNPUBLISH all ${this.examTypes.find((t) => t.value === this.publishExamType)?.label || this.publishExamType} results for ${this.publishTerm}? Results will no longer be visible to students/parents.`
      )
    ) {
      return;
    }

    this.unpublishing = true;
    this.error = '';
    this.success = '';

    this.examService.unpublishExamByType(this.publishExamType, this.publishTerm).subscribe({
      next: (response: any) => {
        this.success = response?.message || 'Results unpublished successfully.';
        this.unpublishing = false;
        setTimeout(() => (this.success = ''), 8000);
      },
      error: (err: any) => {
        console.error('Error unpublishing results:', err);
        this.error = err?.error?.message || 'Failed to unpublish results. Please try again.';
        this.unpublishing = false;
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }
}

