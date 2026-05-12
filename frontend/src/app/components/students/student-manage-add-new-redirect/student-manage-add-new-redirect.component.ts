import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StudentManageShellService } from '../../../services/student-manage-shell.service';

/** Navigating to /students/manage/add-new opens the modal and lands on the flat /students list. */
@Component({
  selector: 'app-student-manage-add-new-redirect',
  template: '',
})
export class StudentManageAddNewRedirectComponent implements OnInit {
  constructor(
    private readonly router: Router,
    private readonly shell: StudentManageShellService
  ) {}

  ngOnInit(): void {
    this.shell.openAddStudentModal();
    void this.router.navigate(['/students'], { replaceUrl: true });
  }
}
