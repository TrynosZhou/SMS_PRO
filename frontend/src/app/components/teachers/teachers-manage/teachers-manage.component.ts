import { Component } from '@angular/core';
import { AddTeacherModalService } from '../../../services/add-teacher-modal.service';

@Component({
  selector: 'app-teachers-manage',
  templateUrl: './teachers-manage.component.html',
  styleUrls: ['./teachers-manage.component.css'],
})
export class TeachersManageComponent {
  constructor(private addTeacherModal: AddTeacherModalService) {}

  openAddTeacher(): void {
    this.addTeacherModal.open();
  }
}
