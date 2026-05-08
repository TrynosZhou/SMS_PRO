import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { SettingsService } from '../../../services/settings.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-invoice-statements',
  templateUrl: './invoice-statements.component.html',
  styleUrls: ['./invoice-statements.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0 })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0 }))
      ])
    ]),
    trigger('slideInUp', [
      state('void', style({ transform: 'translateY(50px)', opacity: 0 })),
      transition(':enter', [
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class InvoiceStatementsComponent implements OnInit {
  invoices: any[] = [];
  students: any[] = [];
  selectedStudent = '';
  selectedStatus = '';
  loading = false;
  success = '';
  error = '';
  showPaymentForm = false;
  selectedInvoice: any = null;
  paymentForm: any = {
    amount: 0,
    paymentDate: '',
    paymentMethod: 'Cash',
    notes: '',
    isPrepayment: false
  };
  currencySymbol = 'KES'; // Default, will be loaded from settings
  submitting = false;
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();

  // PDF Viewer properties
  showPdfViewer = false;
  pdfUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  loadingPdf = false;
  currentInvoiceFilename: string = '';
  currentInvoiceNumber: string = '';

  constructor(
    public financeService: FinanceService,
    private studentService: StudentService,
    public authService: AuthService,
    public router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private settingsService: SettingsService
  ) { }

  ngOnInit() {
    // Get query parameters for filters
    this.route.queryParams.subscribe(params => {
      if (params['studentId']) {
        this.selectedStudent = params['studentId'];
      }
      if (params['status']) {
        this.selectedStatus = params['status'];
      }
    });

    if (this.authService.hasRole('parent')) {
      const user = this.authService.getCurrentUser();
      if (user?.parent?.students) {
        this.students = user.parent.students;
        if (this.students.length === 1) {
          this.selectedStudent = this.students[0].id;
        }
      }
    } else {
      this.loadStudents();
    }
    this.loadInvoices();
    this.loadSettings();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        // Keep default 'KES' if settings fail to load
      }
    });
  }

  loadStudents() {
    this.studentService.getStudents().subscribe({
      next: (data: any) => this.students = data,
      error: (err: any) => console.error(err)
    });
  }

  loadInvoices() {
    this.loading = true;
    this.financeService.getInvoices(
      this.selectedStudent || undefined,
      this.selectedStatus || undefined
    ).subscribe({
      next: (data: any) => {
        this.invoices = data;
        this.loading = false;
      },
      error: (err: any) => {
        console.error(err);
        this.loading = false;
      }
    });
  }

  onFilterChange() {
    // Update URL with query parameters
    const queryParams: any = {};
    if (this.selectedStudent) {
      queryParams.studentId = this.selectedStudent;
    }
    if (this.selectedStatus) {
      queryParams.status = this.selectedStatus;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
    this.loadInvoices();
  }

  openPaymentForm(invoice: any) {
    this.selectedInvoice = invoice;
    // Set default payment date to today
    const today = new Date();
    this.paymentForm.paymentDate = today.toISOString().split('T')[0];
    // Set default amount to the remaining balance
    this.paymentForm.amount = invoice.balance || 0;
    this.paymentForm.paymentMethod = 'Cash';
    this.paymentForm.notes = '';
    this.paymentForm.isPrepayment = false;
    this.showPaymentForm = true;
    this.error = '';
    this.success = '';
  }

  closePaymentForm() {
    this.showPaymentForm = false;
    this.selectedInvoice = null;
    this.paymentForm = {
      amount: 0,
      paymentDate: '',
      paymentMethod: 'Cash',
      notes: '',
      isPrepayment: false
    };
    this.fieldErrors = {};
    this.touchedFields.clear();
    this.submitting = false;
  }

  updatePayment() {
    // Mark all fields as touched
    this.touchedFields.add('amount');
    this.touchedFields.add('paymentDate');
    this.touchedFields.add('paymentMethod');
    
    // Validate all fields
    this.validateField('amount');
    this.validateField('paymentDate');
    this.validateField('paymentMethod');
    
    if (!this.isFormValid()) {
      this.error = 'Please fix the errors in the form';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (!this.selectedInvoice) return;

    // Validate that payment amount doesn't exceed balance
    if (this.paymentForm.amount > this.selectedInvoice.balance) {
      if (!confirm(`Payment amount (${this.currencySymbol} ${this.paymentForm.amount}) exceeds the balance (${this.currencySymbol} ${this.selectedInvoice.balance}). Continue anyway?`)) {
        return;
      }
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    // Prepare payment data
    const paymentData = {
      paidAmount: this.paymentForm.amount,
      paymentDate: this.paymentForm.paymentDate,
      paymentMethod: this.paymentForm.paymentMethod,
      notes: this.paymentForm.notes,
      isPrepayment: this.paymentForm.isPrepayment || false
    };

    this.financeService.updatePayment(this.selectedInvoice.id, paymentData).subscribe({
      next: (response: any) => {
        // Reload invoices to get updated balance
        this.loadInvoices();
        
        // Calculate and display updated balance
        const updatedBalance = response.invoice?.balance || 0;
        this.success = `Payment recorded successfully! Updated balance: ${this.currencySymbol} ${parseFloat(String(updatedBalance)).toFixed(2)}`;
        
        this.submitting = false;
        this.closePaymentForm();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.submitting = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to record payment';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  // Validation methods
  validateField(fieldName: string) {
    this.touchedFields.add(fieldName);
    const value = this.paymentForm[fieldName];
    
    switch (fieldName) {
      case 'amount':
        if (!value || value <= 0) {
          this.fieldErrors[fieldName] = 'Payment amount must be greater than 0';
        } else if (this.selectedInvoice && value > this.selectedInvoice.balance * 1.1) {
          // Allow 10% overpayment as buffer
          this.fieldErrors[fieldName] = 'Payment amount seems unusually high';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'paymentDate':
        if (!value) {
          this.fieldErrors[fieldName] = 'Payment date is required';
        } else {
          const selectedDate = new Date(value);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (selectedDate > today) {
            this.fieldErrors[fieldName] = 'Payment date cannot be in the future';
          } else {
            delete this.fieldErrors[fieldName];
          }
        }
        break;
      case 'paymentMethod':
        if (!value || value.trim() === '') {
          this.fieldErrors[fieldName] = 'Payment method is required';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  isFormValid(): boolean {
    this.validateField('amount');
    this.validateField('paymentDate');
    this.validateField('paymentMethod');
    
    return !this.fieldErrors['amount'] && 
           !this.fieldErrors['paymentDate'] && 
           !this.fieldErrors['paymentMethod'] &&
           !!this.paymentForm.amount && 
           this.paymentForm.amount > 0 &&
           !!this.paymentForm.paymentDate &&
           !!this.paymentForm.paymentMethod;
  }

  onAmountChange() {
    if (this.touchedFields.has('amount')) {
      this.validateField('amount');
    }
  }

  getNewBalance(): number {
    if (!this.selectedInvoice || !this.paymentForm.amount) {
      return this.selectedInvoice?.balance || 0;
    }
    return this.selectedInvoice.balance - this.paymentForm.amount;
  }

  viewInvoicePDF(invoiceId: string, event?: Event) {
    // Prevent any default behavior that might trigger download
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    console.log('viewInvoicePDF called for invoice:', invoiceId);
    
    // Find the invoice to get its number
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    this.currentInvoiceNumber = invoice?.invoiceNumber || 'Invoice';
    
    // Show the modal immediately - this is critical
    this.showPdfViewer = true;
    this.loadingPdf = true;
    this.error = '';
    
    console.log('Modal should be visible now. showPdfViewer:', this.showPdfViewer);
    
    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (result: { blob: Blob; filename: string }) => {
        console.log('PDF received, creating preview URL');
        
        // Clean up previous URL if exists
        if (this.pdfUrl) {
          window.URL.revokeObjectURL(this.pdfUrl);
        }
        
        // Create blob URL for preview (not download)
        this.pdfUrl = window.URL.createObjectURL(result.blob);
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfUrl);
        this.currentInvoiceFilename = result.filename;
        this.loadingPdf = false;
        
        console.log('PDF preview ready. URL created:', this.pdfUrl);
      },
      error: (err: any) => {
        this.loadingPdf = false;
        this.showPdfViewer = false;
        console.error('Error loading invoice PDF:', err);
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to load invoice PDF';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  downloadInvoicePDF() {
    if (!this.pdfUrl || !this.currentInvoiceFilename) {
      this.error = 'PDF not available for download';
      return;
    }

    const link = document.createElement('a');
    link.href = this.pdfUrl;
    link.download = this.currentInvoiceFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  closePdfViewer() {
    this.showPdfViewer = false;
    if (this.pdfUrl) {
      window.URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
    this.safePdfUrl = null;
    this.currentInvoiceFilename = '';
    this.currentInvoiceNumber = '';
  }

  viewReceiptPDF(invoiceId: string) {
    this.financeService.getReceiptPDF(invoiceId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        // Clean up the URL after a delay to free memory
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      },
      error: (err: any) => {
        console.error('Error loading receipt PDF:', err);
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to load receipt PDF';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  getStatusClass(status: string): string {
    const statusMap: any = {
      'paid': 'alert-success',
      'pending': 'alert-info',
      'partial': 'alert-info',
      'overdue': 'alert-error'
    };
    return statusMap[status] || '';
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

