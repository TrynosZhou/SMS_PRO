import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { StudentService } from '../../../services/student.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-record-payment',
  templateUrl: './record-payment.component.html',
  styleUrls: ['./record-payment.component.css']
})
export class RecordPaymentComponent implements OnInit {
  studentId: string = '';
  studentData: any = null;
  loading = false;
  error = '';
  success = '';
  paymentRecorded = false;
  lastPaymentInvoiceId: string | null = null;
  
  paymentForm = {
    amount: 0,
    term: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash(USD)',
    notes: '',
    phoneNumber: '',
    cardNumber: ''
  };

  showPhoneNumberInput = false;
  phoneNumberLabel = '';
  phoneNumberHint = '';
  showCardNumberInput = false;
  
  currentTerm = '';
  currencySymbol = 'KES';
  submitting = false;
  receiptPdfUrl: SafeResourceUrl | null = null;
  receiptBlobUrl: string | null = null;
  showReceipt = false;
  loadingReceipt = false;

  // Name search (Admin/Accountant only)
  nameSearchFirstName = '';
  nameSearchLastName = '';
  nameSearchResults: any[] = [];
  nameSearchSelectedStudentNumber = '';
  nameSearchLoading = false;
  nameSearchError = '';
  showStudentPicker = false;

  private toNumber(value: any): number {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
    return Number.isFinite(n) ? n : 0;
  }

  getBalanceAmount(): number {
    return this.toNumber(this.studentData?.balance ?? 0);
  }

  /**
   * Remaining balance after applying the currently selected payment amount.
   * If negative, the absolute value represents overpayment that will be saved as prepaid credit.
   */
  getNewBalance(): number {
    const balance = this.getBalanceAmount();
    const payment = this.toNumber(this.paymentForm.amount ?? 0);
    return balance - payment;
  }

  getOverpaymentCredit(): number {
    return Math.max(0, -this.getNewBalance());
  }

  getAbsNewBalance(): number {
    return Math.abs(this.getNewBalance());
  }

  setQuickAmount(multiplier: number): void {
    const balance = this.getBalanceAmount();
    if (balance <= 0) {
      this.paymentForm.amount = 0;
      return;
    }

    const raw = balance * multiplier;
    const amount = Math.max(0.01, this.toNumber(raw));
    // Keep 2 decimals to match currency expectations
    this.paymentForm.amount = Math.round(amount * 100) / 100;
  }

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private studentService: StudentService,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.loadCurrentTerm();
    
    // Check for query parameters from outstanding balance page
    this.route.queryParams.subscribe(params => {
      if (params['studentId']) {
        this.studentId = params['studentId'];
        
        // If student data is provided in query params, display it immediately
        if (params['firstName'] && params['lastName'] && params['balance']) {
          // Create a temporary student data object from query params
          this.studentData = {
            studentNumber: params['studentId'],
            firstName: params['firstName'],
            lastName: params['lastName'],
            fullName: `${params['firstName']} ${params['lastName']}`,
            balance: parseFloat(params['balance']) || 0
          };
          
          // Set the payment amount to the balance
          this.paymentForm.amount = parseFloat(params['balance']) || 0;
        }
        
        // Automatically fetch full student balance data
        if (this.studentId) {
          setTimeout(() => {
            this.getBalance();
          }, 300); // Small delay to ensure component is fully initialized
        }
      }
    });
  }

  loadCurrentTerm(): void {
    this.settingsService.getSettings().subscribe({
      next: (raw: any) => {
        const settings = Array.isArray(raw) && raw.length > 0 ? raw[0] : raw;
        if (settings) {
          // Load currency symbol
          this.currencySymbol = settings.currencySymbol || 'KES';
          
          // Use currentTerm from settings, or fallback to activeTerm, or construct from term/year
          this.currentTerm = settings.currentTerm || settings.activeTerm || '';
          
          // If currentTerm is not available, try to construct it from term and year
          if (!this.currentTerm && (settings.term || settings.year)) {
            const term = settings.term || '';
            const year = settings.year || new Date().getFullYear();
            this.currentTerm = term ? `${term} ${year}` : '';
          }
          
          // If still no term, use a default
          if (!this.currentTerm) {
            const currentYear = new Date().getFullYear();
            this.currentTerm = `Term 1 ${currentYear}`;
          }
          
          // Always populate the term field with the current term from settings
          this.paymentForm.term = this.currentTerm;
        } else {
          // If settings is null, set a default term
          const currentYear = new Date().getFullYear();
          this.currentTerm = `Term 1 ${currentYear}`;
          this.paymentForm.term = this.currentTerm;
        }
      },
      error: (error) => {
        console.error('Error loading settings:', error);
        // Set default term on error
        const currentYear = new Date().getFullYear();
        this.currentTerm = `Term 1 ${currentYear}`;
        this.paymentForm.term = this.currentTerm;
      }
    });
  }

  private isUuid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  getBalance(preservePaymentFlag: boolean = false, skipNameSearch: boolean = false): void {
    const query = (this.studentId || '').trim();
    if (!query) {
      this.error = 'Please enter a Student ID/Student Number or First/Last Name';
      return;
    }

    // Store the invoice ID before clearing if we're preserving payment flag
    const preservedInvoiceId = preservePaymentFlag ? this.lastPaymentInvoiceId : null;
    const preservedSuccessMessage = preservePaymentFlag ? this.success : '';
    
    this.loading = true;
    this.error = '';
    // Only clear success message if not preserving it (i.e., new search, not refresh after payment)
    if (!preservePaymentFlag) {
      this.success = '';
    }
    // Only clear paymentRecorded if not preserving it (i.e., new search, not refresh after payment)
    if (!preservePaymentFlag) {
      this.paymentRecorded = false;
      this.lastPaymentInvoiceId = null;
      this.showReceipt = false;
      // Clean up blob URL
      if (this.receiptBlobUrl) {
        window.URL.revokeObjectURL(this.receiptBlobUrl);
        this.receiptBlobUrl = null;
      }
      this.receiptPdfUrl = null;
      // Reload term from settings for new search to ensure it's current
      this.loadCurrentTerm();
    }
    this.studentData = null;
    this.paymentForm.amount = 0;

    this.showStudentPicker = false;
    this.nameSearchResults = [];
    this.nameSearchSelectedStudentNumber = '';
    this.nameSearchError = '';
    this.nameSearchLoading = false;

    this.financeService.getStudentBalance(query).subscribe({
      next: (data: any) => {
        this.studentData = data;
        this.paymentForm.amount = data.balance || 0;
        // Restore preserved invoice ID and success message if we're refreshing after payment
        if (preservePaymentFlag) {
          if (preservedInvoiceId) {
            this.lastPaymentInvoiceId = preservedInvoiceId;
          }
          if (preservedSuccessMessage) {
            this.success = preservedSuccessMessage;
          }
        }
        this.loading = false;
      },
      error: (error: any) => {
        const status = error?.status;
        const errMsg = error?.error?.message || error?.message || 'Failed to get student balance.';

        // If the user typed a name, allow admin/accountant to resolve it and then retry the balance lookup.
        if (status === 404 && this.canSearchByName() && !skipNameSearch) {
          this.loading = false;
          this.studentData = null;
          this.paymentRecorded = false;
          this.lastPaymentInvoiceId = null;

          const searchQuery = query;
          if (!searchQuery) {
            this.error = errMsg;
            return;
          }

          this.nameSearchLoading = true;
          this.studentService.getStudents({ page: 1, limit: 100, search: searchQuery }).subscribe({
            next: (data: any) => {
              const results = Array.isArray(data) ? data : data?.data || [];
              this.nameSearchResults = results || [];
              this.nameSearchLoading = false;

              if (!this.nameSearchResults.length) {
                this.error = 'Student not found. Please enter a valid Student ID/Student Number or correct First/Last Name.';
                return;
              }

              if (this.nameSearchResults.length === 1) {
                const match = this.nameSearchResults[0];
                const resolvedLookupId = match.id || match.studentNumber || searchQuery;
                const resolvedForInput = match.studentNumber || resolvedLookupId;
                this.studentId = resolvedForInput;

                this.loading = true;
                this.error = '';
                this.financeService.getStudentBalance(resolvedLookupId).subscribe({
                  next: (data2: any) => {
                    this.studentData = data2;
                    this.paymentForm.amount = data2.balance || 0;
                    if (preservePaymentFlag) {
                      if (preservedInvoiceId) this.lastPaymentInvoiceId = preservedInvoiceId;
                      if (preservedSuccessMessage) this.success = preservedSuccessMessage;
                    }
                    this.loading = false;
                  },
                  error: (error2: any) => {
                    this.loading = false;
                    this.error = error2?.error?.message || error2?.message || 'Failed to get student balance.';
                  }
                });

                return;
              }

              // Multiple matches: show a picker under the same textbox.
              this.showStudentPicker = true;
              this.nameSearchSelectedStudentNumber = '';
              this.error = '';
            },
            error: (err: any) => {
              this.nameSearchLoading = false;
              this.error = err?.error?.message || err?.message || 'Failed to search students by name.';
            }
          });

          return;
        }

        this.error = errMsg;
        this.loading = false;
        this.studentData = null;
        this.paymentRecorded = false;
        this.lastPaymentInvoiceId = null;
      }
    });
  }

  clear(): void {
    this.studentId = '';
    this.studentData = null;
    this.error = '';
    this.success = '';
    this.paymentRecorded = false;
    this.lastPaymentInvoiceId = null;
    this.paymentForm.amount = 0;
    this.paymentForm.phoneNumber = '';
    this.paymentForm.cardNumber = '';
    this.showPhoneNumberInput = false;
    this.showCardNumberInput = false;

    this.resetNameSearch();

    // Reload term from settings to ensure it's always current
    this.loadCurrentTerm();
    this.showReceipt = false;
    // Clean up blob URL
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
  }

  private resetNameSearch(): void {
    this.nameSearchFirstName = '';
    this.nameSearchLastName = '';
    this.nameSearchResults = [];
    this.nameSearchSelectedStudentNumber = '';
    this.nameSearchLoading = false;
    this.nameSearchError = '';
    this.showStudentPicker = false;
  }

  canSearchByName(): boolean {
    return (
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('accountant')
    );
  }

  searchStudentsByName(): void {
    if (!this.canSearchByName()) return;

    const first = (this.nameSearchFirstName || '').trim();
    const last = (this.nameSearchLastName || '').trim();
    const query = [first, last].filter(Boolean).join(' ').trim();

    if (!query) {
      this.nameSearchError = 'Enter First Name and/or Last Name to search.';
      this.nameSearchResults = [];
      return;
    }

    this.nameSearchError = '';
    this.nameSearchLoading = true;
    this.nameSearchResults = [];
    this.nameSearchSelectedStudentNumber = '';

    this.studentService.getStudents({ page: 1, limit: 100, search: query }).subscribe({
      next: (data: any) => {
        // API may return array or paginated response. Normalize.
        const results = Array.isArray(data) ? data : data?.data || [];
        this.nameSearchResults = results || [];
        this.nameSearchLoading = false;
      },
      error: (err: any) => {
        this.nameSearchLoading = false;
        this.nameSearchError =
          err?.error?.message || err?.message || 'Failed to search students by name';
      }
    });
  }

  useSelectedStudentFromNameSearch(): void {
    if (!this.nameSearchSelectedStudentNumber) return;
    this.studentId = this.nameSearchSelectedStudentNumber;
    this.nameSearchError = '';
    this.nameSearchResults = [];
    this.nameSearchSelectedStudentNumber = '';
    // Skip name-search retry since this selection should be a direct match.
    this.getBalance(false, true);
  }

  studentPickKey(s: any): string {
    return String(s?.id || s?.studentNumber || '');
  }

  @HostListener('document:keyup', ['$event'])
  onDocumentKeyup(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') return;
    if (!this.showStudentPicker) return;
    this.showStudentPicker = false;
    this.nameSearchResults = [];
    this.nameSearchSelectedStudentNumber = '';
  }

  onPaymentMethodChange(): void {
    const method = this.paymentForm.paymentMethod;
    
    // Reset both inputs
    this.showPhoneNumberInput = false;
    this.showCardNumberInput = false;
    this.paymentForm.phoneNumber = '';
    this.paymentForm.cardNumber = '';
    
    if (method === 'EcoCash') {
      this.showPhoneNumberInput = true;
      this.phoneNumberLabel = 'EcoCash Number';
      this.phoneNumberHint = 'Enter the EcoCash mobile number for this payment';
    } else if (method === 'InnBucks') {
      this.showPhoneNumberInput = true;
      this.phoneNumberLabel = 'InnBucks Number';
      this.phoneNumberHint = 'Enter the InnBucks mobile number for this payment';
    } else if (method === 'ZIG(ZW)') {
      this.showPhoneNumberInput = true;
      this.phoneNumberLabel = 'EcoCash Number';
      this.phoneNumberHint = 'Enter the EcoCash mobile number for ZIG payment';
    } else if (method === 'Visa Card') {
      this.showCardNumberInput = true;
    }
  }

  recordPayment(): void {
    if (!this.studentData || !this.studentData.lastInvoiceId) {
      this.error = 'Please get student balance first';
      return;
    }

    if (!this.paymentForm.amount || this.paymentForm.amount <= 0) {
      this.error = 'Payment amount must be greater than 0';
      return;
    }

    if (!this.paymentForm.term) {
      this.error = 'Term is required';
      return;
    }

    // Validate phone number for mobile payment methods
    if (this.showPhoneNumberInput) {
      if (!this.paymentForm.phoneNumber || this.paymentForm.phoneNumber.trim() === '') {
        this.error = `${this.phoneNumberLabel} is required for ${this.paymentForm.paymentMethod}`;
        return;
      }

      // Basic phone number validation (Zimbabwe format)
      const phoneRegex = /^(\+263|0)?[7][0-9]{8}$/;
      if (!phoneRegex.test(this.paymentForm.phoneNumber.replace(/\s/g, ''))) {
        this.error = 'Invalid phone number format. Please use format: 0771234567 or +263771234567';
        return;
      }
    }

    // Validate card number for Visa Card
    if (this.showCardNumberInput) {
      if (!this.paymentForm.cardNumber || this.paymentForm.cardNumber.trim() === '') {
        this.error = 'Card number is required for Visa Card payment';
        return;
      }

      // Basic card number validation (digits only, allowing spaces)
      const cardNumberClean = this.paymentForm.cardNumber.replace(/\s/g, '');
      if (!/^\d{4,19}$/.test(cardNumberClean)) {
        this.error = 'Invalid card number. Please enter at least the last 4 digits or full card number';
        return;
      }
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    const paymentData: any = {
      paidAmount: this.paymentForm.amount,
      paymentDate: this.paymentForm.paymentDate,
      paymentMethod: this.paymentForm.paymentMethod,
      notes: this.paymentForm.notes,
      isPrepayment: false
    };

    // Add phone number if applicable
    if (this.showPhoneNumberInput && this.paymentForm.phoneNumber) {
      paymentData.phoneNumber = this.paymentForm.phoneNumber;
    }

    // Add card number if applicable
    if (this.showCardNumberInput && this.paymentForm.cardNumber) {
      paymentData.cardNumber = this.paymentForm.cardNumber;
    }

    // Store the invoice ID before recording payment
    const invoiceIdForPayment = this.studentData.lastInvoiceId;
    
    this.financeService.updatePayment(invoiceIdForPayment, paymentData).subscribe({
      next: (response: any) => {
        // Get payment details for success message
        const paymentAmount = this.paymentForm.amount;
        const updatedBalance = response.invoice?.balance || 0;
        const studentName = this.studentData?.fullName || `${this.studentData?.firstName || ''} ${this.studentData?.lastName || ''}`.trim();
        
        // Create a comprehensive success message
        let successMessage = `✅ Payment of ${this.currencySymbol} ${this.formatCurrency(paymentAmount)} recorded successfully`;
        
        if (studentName) {
          successMessage += ` for ${studentName}`;
        }
        
        if (updatedBalance !== undefined) {
          if (updatedBalance > 0) {
            successMessage += `. Remaining balance: ${this.currencySymbol} ${this.formatCurrency(updatedBalance)}`;
          } else {
            successMessage += `. Invoice fully paid!`;
          }
        }
        
        successMessage += '.';
        
        this.success = successMessage;
        this.paymentRecorded = true;
        this.lastPaymentInvoiceId = invoiceIdForPayment; // Store the invoice ID used for this payment
        this.submitting = false;
        
        // Refresh student balance (preserve paymentRecorded flag and invoice ID)
        this.getBalance(true);
        
        // Auto-hide success message after 8 seconds
        setTimeout(() => {
          if (this.success.includes('Payment of')) {
            this.success = '';
          }
        }, 8000);
        
        // Note: Receipt will only be displayed when user clicks the "Receipt" button
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to record payment';
        this.submitting = false;
      }
    });
  }

  showReceiptPreview(): void {
    // Use the invoice ID from the last payment if available, otherwise use current student's last invoice
    const invoiceId = this.lastPaymentInvoiceId || (this.studentData?.lastInvoiceId);
    
    if (!invoiceId) {
      this.error = 'Please get student balance and record payment first';
      return;
    }

    this.loadReceiptForInvoice(invoiceId);
  }

  private loadReceiptForInvoice(invoiceId: string): void {
    if (!invoiceId) {
      this.error = 'Invoice ID is required to load receipt';
      return;
    }

    this.loadingReceipt = true;
    this.error = '';
    this.showReceipt = true; // Show the receipt container immediately to show loading state
    
    // Revoke previous URL if exists to free memory
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
    
    console.log('Loading receipt for invoice ID:', invoiceId);
    
    this.financeService.getReceiptPDF(invoiceId).subscribe({
      next: (blob: Blob) => {
        console.log('Receipt blob received, size:', blob.size, 'type:', blob.type);
        
        if (!blob || blob.size === 0) {
          this.error = 'Receipt PDF is empty or invalid';
          this.loadingReceipt = false;
          this.showReceipt = false;
          return;
        }

        // Check if it's actually a PDF
        if (blob.type !== 'application/pdf' && !blob.type.includes('pdf')) {
          console.warn('Received blob type:', blob.type, 'Expected PDF');
          // Still try to display it as it might be a PDF with wrong content-type
        }

        try {
          const url = window.URL.createObjectURL(blob);
          this.receiptBlobUrl = url;
          this.receiptPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
          this.loadingReceipt = false;
          console.log('Receipt URL created successfully');
          
          // Scroll to receipt preview
          setTimeout(() => {
            const receiptElement = document.querySelector('.receipt-preview');
            if (receiptElement) {
              receiptElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        } catch (err: any) {
          console.error('Error creating receipt URL:', err);
          this.error = 'Failed to create receipt preview: ' + (err.message || 'Unknown error');
          this.loadingReceipt = false;
          this.showReceipt = false;
        }
      },
      error: (error: any) => {
        console.error('Error loading receipt PDF:', error);
        this.loadingReceipt = false;
        this.showReceipt = false;
        this.receiptPdfUrl = null;
        this.receiptBlobUrl = null;
        
        if (error.status === 404) {
          this.error = 'Receipt not found. Please ensure the payment was recorded successfully.';
        } else if (error.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else if (error.status === 500) {
          this.error = 'Server error while generating receipt. Please try again.';
        } else {
          const errorMessage = error.error?.message || error.message || 'Failed to load receipt';
          this.error = `Error loading receipt: ${errorMessage}`;
        }
        
        // Show error for 5 seconds
        setTimeout(() => {
          if (this.error.includes('receipt')) {
            this.error = '';
          }
        }, 5000);
      }
    });
  }

  closeReceipt(): void {
    this.showReceipt = false;
    // Clean up blob URL when closing
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
  }

  openReceiptInNewWindow(): void {
    if (this.receiptBlobUrl) {
      window.open(this.receiptBlobUrl, '_blank');
    } else if (this.receiptPdfUrl) {
      // Fallback: try to extract URL from SafeResourceUrl
      const url = (this.receiptPdfUrl as any).changingThisBreaksApplicationSecurity;
      if (url) {
        window.open(url, '_blank');
      }
    }
  }

  downloadReceipt(): void {
    if (!this.receiptBlobUrl) {
      this.error = 'Receipt not available for download';
      return;
    }

    const invoiceId = this.lastPaymentInvoiceId || (this.studentData?.lastInvoiceId);
    const filename = `receipt-${invoiceId || 'payment'}-${new Date().getTime()}.pdf`;
    
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = this.receiptBlobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}
