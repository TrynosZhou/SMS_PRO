import { ChangeDetectorRef, Component } from '@angular/core';
import { TimetableService } from '../../../services/timetable.service';

@Component({
  selector: 'app-timetable-manage',
  templateUrl: './timetable-manage.component.html',
  styleUrls: ['./timetable-manage.component.css'],
})
export class TimetableManageComponent {
  showResetDialog = false;
  resetWord = '';
  resetInProgress = false;
  resetError: string | null = null;
  resetSuccess: string | null = null;

  constructor(
    private timetableService: TimetableService,
    private cdr: ChangeDetectorRef
  ) {}

  openResetDialog(): void {
    this.showResetDialog = true;
    this.resetWord = '';
    this.resetError = null;
  }

  closeResetDialog(): void {
    this.showResetDialog = false;
    this.resetWord = '';
    this.resetError = null;
  }

  confirmReset(): void {
    if (this.resetWord.trim() !== 'RESET') {
      this.resetError = 'You must type RESET (uppercase) to confirm.';
      return;
    }
    this.resetInProgress = true;
    this.resetError = null;
    this.timetableService.clearAllTeachingData().subscribe({
      next: (res) => {
        this.resetInProgress = false;
        this.showResetDialog = false;
        this.resetWord = '';
        this.resetSuccess = res.message || 'All teaching data has been cleared successfully.';
        this.cdr.detectChanges();
        setTimeout(() => (this.resetSuccess = null), 7000);
      },
      error: (err) => {
        this.resetInProgress = false;
        this.resetError =
          err?.error?.message || err?.message || 'Failed to clear teaching data. Please try again.';
        this.cdr.detectChanges();
      },
    });
  }
}
