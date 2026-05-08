import { Component, HostListener } from '@angular/core';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-finance-manage',
  templateUrl: './finance-manage.component.html',
  styleUrls: ['./finance-manage.component.css'],
})
export class FinanceManageComponent {
  showBalanceEnquiryModal = false;

  constructor(private authService: AuthService) {}

  showAuditTab(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  openBalanceEnquiry(): void {
    this.showBalanceEnquiryModal = true;
    document.body.classList.add('fm-modal-open');
  }

  closeBalanceEnquiry(): void {
    this.showBalanceEnquiryModal = false;
    document.body.classList.remove('fm-modal-open');
  }

  onModalBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('fm-be-backdrop')) {
      this.closeBalanceEnquiry();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showBalanceEnquiryModal) {
      this.closeBalanceEnquiry();
    }
  }
}
