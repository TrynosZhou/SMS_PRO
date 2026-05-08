import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Lets deep links and child routes request the Student Manager shell to open the add-student modal.
 */
@Injectable({ providedIn: 'root' })
export class StudentManageShellService {
  private readonly openAddSubject = new Subject<void>();
  /** Subscribe in {@link StudentsManageComponent} to toggle the add-student modal. */
  readonly addStudentModal$ = this.openAddSubject.asObservable();

  openAddStudentModal(): void {
    this.openAddSubject.next();
  }
}
