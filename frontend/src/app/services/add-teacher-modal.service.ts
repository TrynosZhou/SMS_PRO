import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

/**
 * Global controller for the shared "Add New Teacher" modal.
 * Any component can call `open()` to display the modal; the modal
 * component subscribes to the visibility stream and the `created$`
 * signal so the caller can refresh its list after a successful save.
 */
@Injectable({ providedIn: 'root' })
export class AddTeacherModalService {
  private readonly visibleSubject = new BehaviorSubject<boolean>(false);
  readonly visible$: Observable<boolean> = this.visibleSubject.asObservable();

  private readonly createdSubject = new Subject<any>();
  /** Emits the newly-created teacher payload returned by the API. */
  readonly created$: Observable<any> = this.createdSubject.asObservable();

  open(): void {
    this.visibleSubject.next(true);
  }

  close(): void {
    this.visibleSubject.next(false);
  }

  emitCreated(teacher: any): void {
    this.createdSubject.next(teacher);
  }
}
