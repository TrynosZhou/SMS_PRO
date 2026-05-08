import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-teachers-manage',
  templateUrl: './teachers-manage.component.html',
  styleUrls: ['./teachers-manage.component.css'],
})
export class TeachersManageComponent {
  constructor(public router: Router) {}

  /** Active for Teachers list and Add/Edit teacher. */
  isTeachersSectionActive(): boolean {
    const u = this.router.url.split('?')[0];
    return (
      u.includes('/teachers/manage/teachers') ||
      u.includes('/teachers/manage/edit')
    );
  }
}
