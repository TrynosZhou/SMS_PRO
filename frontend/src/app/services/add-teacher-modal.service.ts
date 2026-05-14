import { Router } from '@angular/router';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

/**
 * Opens the full-page "Add teacher" flow and notifies subscribers when a teacher is created.
 */
@Injectable({ providedIn: 'root' })
export class AddTeacherModalService {
  private readonly visibleSubject = new BehaviorSubject<boolean>(false);
  /** @deprecated No modal; kept for compatibility if anything still subscribes. */
  readonly visible$: Observable<boolean> = this.visibleSubject.asObservable();

  private readonly createdSubject = new Subject<any>();
  readonly created$: Observable<any> = this.createdSubject.asObservable();

  constructor(private router: Router) {}

  open(): void {
    void this.router.navigate(['/teachers/manage/add-new']);
  }

  close(): void {
    this.visibleSubject.next(false);
  }

  emitCreated(teacher: any): void {
    this.createdSubject.next(teacher);
  }
}
