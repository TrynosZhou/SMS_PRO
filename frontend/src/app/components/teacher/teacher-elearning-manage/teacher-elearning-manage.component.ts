import { Component } from '@angular/core';
import { Router, IsActiveMatchOptions } from '@angular/router';

/**
 * Tabbed shell for teacher E-learning: Create Task, Submissions, Record Book, My Classes.
 * Child routes render in router-outlet.
 */
@Component({
  selector: 'app-teacher-elearning-manage',
  templateUrl: './teacher-elearning-manage.component.html',
  styleUrls: ['./teacher-elearning-manage.component.css'],
})
export class TeacherElearningManageComponent {
  readonly linkActiveSubset: IsActiveMatchOptions = {
    paths: 'subset',
    queryParams: 'subset',
    fragment: 'ignored',
    matrixParams: 'ignored',
  };

  constructor(public router: Router) {}

  isTasksActive(): boolean {
    const u = this.router.url.split('?')[0];
    return u.endsWith('/elearning-manage') || u.endsWith('/elearning-manage/tasks');
  }

  isSubmissionsActive(): boolean {
    return this.router.url.split('?')[0].includes('/elearning-manage/submissions');
  }

  isRecordBookActive(): boolean {
    return this.router.url.split('?')[0].includes('/elearning-manage/record-book');
  }

  isMyClassesActive(): boolean {
    return this.router.url.split('?')[0].includes('/elearning-manage/my-classes');
  }
}
