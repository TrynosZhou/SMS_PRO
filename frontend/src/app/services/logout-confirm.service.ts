import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Opens a global Yes/No logout confirmation (rendered in AppComponent).
 * Automatic logouts (timeout, 401) should call AuthService.logout() directly.
 */
@Injectable({ providedIn: 'root' })
export class LogoutConfirmService {
  private readonly visibleSubject = new BehaviorSubject<boolean>(false);
  readonly visible$ = this.visibleSubject.asObservable();

  open(): void {
    this.visibleSubject.next(true);
  }

  close(): void {
    this.visibleSubject.next(false);
  }
}
