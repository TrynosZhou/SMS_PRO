import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from '../../../services/message.service';
import { SettingsService } from '../../../services/settings.service';
import { FinanceService } from '../../../services/finance.service';

@Component({
  selector: 'app-parent-dashboard',
  templateUrl: './parent-dashboard.component.html',
  styleUrls: ['./parent-dashboard.component.css']
})
export class ParentDashboardComponent implements OnInit {
  students: any[] = [];
  filteredStudents: any[] = [];
  loading = false;
  error = '';
  currencySymbol = 'KES';
  mobileMenuOpen = false;
  isMobile = false;
  searchTerm = '';
  sortBy: 'name' | 'balance-high' | 'balance-low' = 'name';
  lastUpdated: Date | null = null;
  unreadCount = 0;
  pendingUnlinkId: string | null = null;
  pendingUnlinkName = '';

  invoicePreviewOpen = false;
  invoicePreviewBlob: Blob | null = null;
  invoicePreviewFilename = 'invoice.pdf';

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private messageService: MessageService,
    private settingsService: SettingsService,
    private financeService: FinanceService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadSettings();
    this.loadStudents();
    this.loadUnreadBadge();
    this.checkMobile();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.checkMobile();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key === 'Escape' && this.pendingUnlinkId) {
      this.cancelUnlink();
    }
  }

  checkMobile() {
    this.isMobile = window.innerWidth <= 900;
    if (!this.isMobile) {
      this.mobileMenuOpen = false;
    }
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu() {
    this.mobileMenuOpen = false;
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
      }
    });
  }

  loadStudents() {
    this.loading = true;
    this.error = '';
    
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.students = response.students || [];
        this.applyFilters();
        this.lastUpdated = new Date();
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = err.error?.message || 'Failed to load students';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  viewReportCard(student: any) {
    this.closeMobileMenu();
    // Check if term balance allows access (term balance must be zero)
    const termBalance = parseFloat(String(student.termBalance || 0));

    if (termBalance > 0) {
      this.error = `Report card access is restricted. Please clear the outstanding term balance of ${this.currencySymbol} ${termBalance.toFixed(2)} to view the report card.`;
      setTimeout(() => this.error = '', 8000);
      return;
    }

    this.router.navigate(['/report-cards'], {
      queryParams: { studentId: student.id }
    });
  }

  requestUnlink(student: any) {
    this.pendingUnlinkId = student.id;
    this.pendingUnlinkName =
      `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'this student';
  }

  cancelUnlink() {
    this.pendingUnlinkId = null;
    this.pendingUnlinkName = '';
  }

  confirmUnlink() {
    if (!this.pendingUnlinkId) {
      return;
    }
    const id = this.pendingUnlinkId;
    this.cancelUnlink();
    this.parentService.unlinkStudent(id).subscribe({
      next: () => {
        this.loadStudents();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  loadUnreadBadge() {
    this.messageService.getParentMessages().subscribe({
      next: (res: any) => {
        const msgs = res.messages || [];
        this.unreadCount = msgs.filter((m: any) => !m.isRead).length;
      },
      error: () => {
        this.unreadCount = 0;
      }
    });
  }

  linkMoreStudents() {
    this.closeMobileMenu();
    this.router.navigate(['/parent/link-students']);
  }

  logout() {
    this.authService.logout();
  }

  manageAccount() {
    this.closeMobileMenu();
    this.router.navigate(['/parent/manage-account']);
  }

  getFirstStudent(): any {
    return this.students.length > 0 ? this.students[0] : null;
  }

  getTotalStudents(): number {
    return this.students.length;
  }

  getPendingFeesCount(): number {
    return this.getStudentsWithDueBalance();
  }

  getOutstandingBalance(): number {
    return this.students.reduce((sum, student) => {
      const balance = Number(student.currentInvoiceBalance || 0);
      return balance > 0 ? sum + balance : sum;
    }, 0);
  }

  getCreditBalance(): number {
    return this.students.reduce((sum, student) => {
      const balance = Number(student.currentInvoiceBalance || 0);
      return balance < 0 ? sum + Math.abs(balance) : sum;
    }, 0);
  }

  getStudentsWithClearTermBalance(): number {
    return this.students.filter((student) => Number(student.termBalance || 0) === 0).length;
  }

  getStudentsWithDueBalance(): number {
    return this.students.filter((student) => Number(student.currentInvoiceBalance || 0) > 0).length;
  }

  getStudentsInCreditCount(): number {
    return this.students.filter((student) => Number(student.currentInvoiceBalance || 0) < 0).length;
  }

  getStudentsSettledCount(): number {
    return this.students.filter((student) => Number(student.currentInvoiceBalance || 0) === 0).length;
  }

  getStudentsWithRestrictedReportCard(): number {
    return this.students.filter((student) => Number(student.termBalance || 0) > 0).length;
  }

  getAverageOutstandingPerDueStudent(): number {
    const dueStudents = this.students.filter((student) => Number(student.currentInvoiceBalance || 0) > 0);
    if (dueStudents.length === 0) {
      return 0;
    }
    return this.getOutstandingBalance() / dueStudents.length;
  }

  getPaymentReadinessPercent(): number {
    if (!this.students.length) {
      return 0;
    }

    const readiness = (this.getStudentsWithClearTermBalance() / this.students.length) * 100;
    return Math.round(readiness);
  }

  getStudentBadge(student: any): string {
    const balance = Number(student.currentInvoiceBalance || 0);
    if (balance > 0) {
      return 'Payment Due';
    }
    if (balance < 0) {
      return 'In Credit';
    }
    return 'Settled';
  }

  getTermBalanceBadge(student: any): string {
    return Number(student.termBalance || 0) > 0 ? 'Report Card Locked' : 'Report Card Ready';
  }

  getTermBalanceIsClear(student: any): boolean {
    return Number(student.termBalance || 0) === 0;
  }

  formatCurrency(amount: number): string {
    return `${this.currencySymbol} ${Number(amount || 0).toFixed(2)}`;
  }

  getLastUpdatedText(): string {
    if (!this.lastUpdated) {
      return 'Not yet refreshed';
    }
    return this.lastUpdated.toLocaleString();
  }

  getWelcomeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
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

  getParentTitleGreeting(): string {
    const greeting = this.getWelcomeGreeting();
    const user = this.authService.getCurrentUser();
    const parent = user?.parent;
    if (!parent) {
      return `${greeting}, Parent`;
    }

    const firstName = String(parent.firstName || '').trim();
    const lastName = String(parent.lastName || '').trim();
    const initial = firstName ? firstName.charAt(0).toUpperCase() : '';
    const genderNorm = this.normalizeParentGender(parent.gender);

    if (!genderNorm) {
      const fallback = firstName || 'Parent';
      return `${greeting}, ${fallback}`;
    }

    const title = genderNorm === 'male' ? 'Mr' : 'Mrs';
    const namePart = lastName
      ? (initial ? `${lastName} ${initial}` : lastName)
      : (firstName || 'Parent');

    return `${greeting} ${title} ${namePart}`.trim();
  }

  private normalizeParentGender(g: any): 'male' | 'female' | null {
    if (g === null || g === undefined) return null;
    const s = String(g).trim().toLowerCase();
    if (s === 'male' || s === 'm') return 'male';
    if (s === 'female' || s === 'f') return 'female';
    return null;
  }

  getTodayDisplayDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  onSearchTermChange(term: string) {
    this.searchTerm = term;
    this.applyFilters();
  }

  onSortByChange(sortBy: 'name' | 'balance-high' | 'balance-low') {
    this.sortBy = sortBy;
    this.applyFilters();
  }

  refreshDashboard() {
    this.loadStudents();
    this.loadUnreadBadge();
  }

  applyFilters() {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    const filtered = this.students.filter((student) => {
      if (!normalizedSearch) {
        return true;
      }

      const fullName = `${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
      const studentNumber = String(student.studentNumber || '').toLowerCase();
      const className = String(student.class?.name || '').toLowerCase();
      return fullName.includes(normalizedSearch)
        || studentNumber.includes(normalizedSearch)
        || className.includes(normalizedSearch);
    });

    this.filteredStudents = filtered.sort((a, b) => {
      const balanceA = Number(a.currentInvoiceBalance || 0);
      const balanceB = Number(b.currentInvoiceBalance || 0);

      if (this.sortBy === 'balance-high') {
        return balanceB - balanceA;
      }

      if (this.sortBy === 'balance-low') {
        return balanceA - balanceB;
      }

      const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
      const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  viewReportCardForFirstStudent() {
    const firstStudent = this.filteredStudents.length > 0 ? this.filteredStudents[0] : this.getFirstStudent();
    if (!firstStudent) {
      this.closeMobileMenu();
      return;
    }
    this.viewReportCard(firstStudent);
  }

  /** Opens the student dashboard (parent view for a linked child). */
  openStudentPortal() {
    this.closeMobileMenu();
    const firstStudent = this.filteredStudents.length > 0 ? this.filteredStudents[0] : this.getFirstStudent();
    if (!firstStudent) {
      this.error = 'No linked students. Link a child first from Link Students.';
      setTimeout(() => (this.error = ''), 6000);
      return;
    }
    this.router.navigate(['/student/dashboard'], { queryParams: { studentId: firstStudent.id } });
  }

  /** True when any Communications hub tab is open. */
  isCommunicationsActive(): boolean {
    return this.router.url.startsWith('/parent/communications');
  }

  /** Opens Communications (default: messages from school). */
  openCommunications(segment: 'view' | 'send' | 'sent' = 'view') {
    this.closeMobileMenu();
    void this.router.navigate(['/parent/communications', segment]);
  }

  openInbox() {
    this.openCommunications('view');
  }

  openCompose() {
    this.openCommunications('send');
  }

  openOutbox() {
    this.openCommunications('sent');
  }

  makePayment() {
    this.closeMobileMenu();
    this.router.navigate(['/parent/payment']);
  }

  viewCurrentInvoice() {
    this.closeMobileMenu();
    if (this.students.length === 0) {
      this.error = 'No linked students found. Please link a student first.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Get the first linked student's invoices
    const firstStudent = this.students[0];
    
    // Fetch invoices for this student
    this.financeService.getInvoices(firstStudent.id).subscribe({
      next: (invoices: any[]) => {
        if (invoices.length === 0) {
          this.error = 'No invoices found for this student.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // Get the most recent invoice
        const latestInvoice = invoices.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })[0];

        // View the invoice PDF
        this.financeService.getInvoicePDF(latestInvoice.id).subscribe({
          next: (result: { blob: Blob; filename: string }) => {
            this.invoicePreviewFilename = result.filename || 'invoice.pdf';
            this.invoicePreviewBlob = result.blob;
            this.invoicePreviewOpen = true;
          },
          error: (err: any) => {
            console.error('Error loading invoice PDF:', err);
            this.error = err.error?.message || 'Failed to load invoice PDF';
            setTimeout(() => this.error = '', 5000);
          }
        });
      },
      error: (err: any) => {
        console.error('Error fetching invoices:', err);
        this.error = err.error?.message || 'Failed to fetch invoices';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  closeInvoicePreview(): void {
    this.invoicePreviewOpen = false;
    this.invoicePreviewBlob = null;
    this.invoicePreviewFilename = 'invoice.pdf';
  }
}
