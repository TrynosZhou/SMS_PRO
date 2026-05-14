import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Navigates to the full-page add-student flow under Student Manager (`/students/manage/add-new`).
 */
@Injectable({ providedIn: 'root' })
export class StudentManageShellService {
  constructor(private readonly router: Router) {}

  openAddStudentModal(): void {
    void this.router.navigate(['/students/manage/add-new']);
  }
}
