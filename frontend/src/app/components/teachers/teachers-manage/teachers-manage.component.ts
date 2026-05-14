import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-teachers-manage',
  templateUrl: './teachers-manage.component.html',
  styleUrls: ['./teachers-manage.component.css'],
})
export class TeachersManageComponent {
  constructor(private readonly router: Router) {}

  /** Hide shell header and tabs on full-page add-teacher flow. */
  showManageTabs(): boolean {
    const p = this.router.url.split('?')[0].replace(/\/+$/, '');
    return !p.endsWith('/teachers/manage/add-new');
  }
}
