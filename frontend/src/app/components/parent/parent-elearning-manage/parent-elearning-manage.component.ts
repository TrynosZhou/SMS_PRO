import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from '../../../services/message.service';
import { FinanceService } from '../../../services/finance.service';

export type ParentElTab = 'overview' | 'messages' | 'records';

@Component({
  selector: 'app-parent-elearning-manage',
  templateUrl: './parent-elearning-manage.component.html',
  styleUrls: ['./parent-elearning-manage.component.css'],
})
export class ParentElearningManageComponent implements OnInit {
  activeTab: ParentElTab = 'overview';
  students: any[] = [];
  loading = false;
  error = '';
  unreadCount = 0;
  currencySymbol = 'KES';
  mobileMenuOpen = false;
  isMobile = false;

  invoicePreviewOpen = false;
  invoicePreviewBlob: Blob | null = null;
  invoicePreviewFilename = 'invoice.pdf';

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private messageService: MessageService,
    private financeService: FinanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user || String(user.role).toLowerCase() !== 'parent') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadStudents();
    this.loadUnreadBadge();
    this.checkMobile();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.checkMobile();
  }

  checkMobile(): void {
    this.isMobile = window.innerWidth <= 900;
    if (!this.isMobile) {
      this.mobileMenuOpen = false;
    }
  }

  toggleMobileTabMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileTabMenu(): void {
    this.mobileMenuOpen = false;
  }

  setTab(tab: ParentElTab): void {
    this.activeTab = tab;
    this.closeMobileTabMenu();
  }

  isTabActive(tab: ParentElTab): boolean {
    return this.activeTab === tab;
  }

  loadStudents(): void {
    this.loading = true;
    this.error = '';
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.students = response.students || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to load linked students';
        setTimeout(() => (this.error = ''), 6000);
      },
    });
  }

  loadUnreadBadge(): void {
    this.messageService.getParentMessages().subscribe({
      next: (res: any) => {
        const msgs = res.messages || [];
        this.unreadCount = msgs.filter((m: any) => !m.isRead).length;
      },
      error: () => {
        this.unreadCount = 0;
      },
    });
  }

  goInbox(): void {
    this.router.navigate(['/parent/communications/view']);
  }

  goCompose(): void {
    this.router.navigate(['/parent/communications/send']);
  }

  goOutbox(): void {
    this.router.navigate(['/parent/communications/sent']);
  }

  openStudentPortal(): void {
    const first = this.students[0];
    if (!first) {
      this.error = 'Link a student first from Account → Link students.';
      setTimeout(() => (this.error = ''), 6000);
      return;
    }
    this.router.navigate(['/student/dashboard'], { queryParams: { studentId: first.id } });
  }

  openStudentPortalFor(studentId: string): void {
    this.router.navigate(['/student/dashboard'], { queryParams: { studentId } });
  }

  viewReportCard(student: any): void {
    const termBalance = parseFloat(String(student.termBalance || 0));
    if (termBalance > 0) {
      this.error = `Clear the term balance (${this.currencySymbol} ${termBalance.toFixed(2)}) to open the report card.`;
      setTimeout(() => (this.error = ''), 8000);
      return;
    }
    this.router.navigate(['/report-cards'], { queryParams: { studentId: student.id } });
  }

  linkStudents(): void {
    this.router.navigate(['/parent/link-students']);
  }

  manageAccount(): void {
    this.router.navigate(['/parent/manage-account']);
  }

  viewCurrentInvoice(): void {
    if (this.students.length === 0) {
      this.error = 'No linked students. Link a child first.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    const firstStudent = this.students[0];
    this.financeService.getInvoices(firstStudent.id).subscribe({
      next: (invoices: any[]) => {
        if (!invoices.length) {
          this.error = 'No invoices found for this student.';
          setTimeout(() => (this.error = ''), 5000);
          return;
        }
        const latest = [...invoices].sort((a: any, b: any) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return db - da;
        })[0];
        this.financeService.getInvoicePDF(latest.id).subscribe({
          next: (result: { blob: Blob; filename: string }) => {
            this.invoicePreviewFilename = result.filename || 'invoice.pdf';
            this.invoicePreviewBlob = result.blob;
            this.invoicePreviewOpen = true;
          },
          error: (err: any) => {
            this.error = err.error?.message || 'Failed to load invoice PDF';
            setTimeout(() => (this.error = ''), 5000);
          },
        });
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to fetch invoices';
        setTimeout(() => (this.error = ''), 5000);
      },
    });
  }

  closeInvoicePreview(): void {
    this.invoicePreviewOpen = false;
    this.invoicePreviewBlob = null;
    this.invoicePreviewFilename = 'invoice.pdf';
  }

  formatCurrency(amount: number): string {
    return `${this.currencySymbol} ${Number(amount || 0).toFixed(2)}`;
  }

  getParentDisplayName(): string {
    const user = this.authService.getCurrentUser();
    const p = user?.parent;
    if (!p) {
      return 'Parent';
    }
    const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
    return name || 'Parent';
  }

  getTodayDisplayDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
