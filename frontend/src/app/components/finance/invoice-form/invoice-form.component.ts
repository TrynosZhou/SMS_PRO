import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-invoice-form',
  templateUrl: './invoice-form.component.html',
  styleUrls: ['./invoice-form.component.css']
})
export class InvoiceFormComponent implements OnInit {
  invoice: any = {
    studentId: '',
    amount: 0,
    dueDate: '',
    term: '',
    description: ''
  };
  students: any[] = [];
  filteredStudents: any[] = [];
  selectedStudentData: any = null;
  studentSearchQuery = '';
  nextTermBalance: any = null;
  currencySymbol = '$';
  currentTerm = '';
  suggestedTerm = '';
  error = '';
  success = '';
  submitting = false;
  minDate = '';
  createdInvoiceId: string | null = null;
  createdInvoiceNumber: string | null = null;
  showPdfViewer = false;
  pdfUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  loadingPdf = false;
  uniformItemsCatalog: any[] = [];
  selectedUniformItems: {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[] = [];
  uniformSelection = {
    itemId: '',
    quantity: 1
  };
  isSuperAdmin = false;
  isAccountant = false;
  canManageFinance = false;
  studentBalanceInfo: any = null;
  fetchingBalance = false;
  discountAmount = 0;

  constructor(
    private financeService: FinanceService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    public router: Router
  ) {
    // Set min date to today
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];
    this.isSuperAdmin = this.authService.hasRole('superadmin');
    this.isAccountant = this.authService.hasRole('accountant');
    this.canManageFinance = this.authService.hasRole('admin') || 
                           this.authService.hasRole('superadmin') || 
                           this.authService.hasRole('accountant');
  }

  ngOnInit() {
    // Allow SuperAdmin, Admin, and Accountant to access this page
    if (!this.canManageFinance) {
      this.router.navigate(['/invoices']);
      return;
    }
    // Initialize amount to 0 for Accountants
    if (this.isAccountant) {
      this.invoice.amount = 0;
    }
    this.loadStudents();
    this.loadSettings();
    this.loadUniformItems();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.currencySymbol = row?.currencySymbol || '$';
        this.currentTerm = row?.currentTerm || '';
        this.suggestedTerm = this.getSuggestedTerm(this.currentTerm);
        // Pre-fill term if available
        if (!this.invoice.term && this.suggestedTerm) {
          this.invoice.term = this.suggestedTerm;
        }
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.currencySymbol = '$';
      }
    });
  }

  loadUniformItems() {
    this.settingsService.getUniformItems().subscribe({
      next: (items: any[]) => {
        this.uniformItemsCatalog = (items || []).filter(item => item.isActive !== false);
      },
      error: (err: any) => {
        console.error('Error loading uniform items:', err);
      }
    });
  }

  getSuggestedTerm(currentTerm: string): string {
    if (!currentTerm) {
      const currentYear = new Date().getFullYear();
      return `Term 1 ${currentYear}`;
    }

    // Try to determine next term
    const termMatch = currentTerm.match(/Term\s*(\d+)(?:\s*(\d{4}))?/i);
    if (termMatch) {
      const termNum = parseInt(termMatch[1]);
      const year = termMatch[2] ? parseInt(termMatch[2]) : new Date().getFullYear();
      
      if (termNum === 1) {
        return `Term 2 ${year}`;
      } else if (termNum === 2) {
        return `Term 3 ${year}`;
      } else if (termNum === 3) {
        return `Term 1 ${year + 1}`;
      }
    }
    
    return currentTerm;
  }

  useSuggestedTerm() {
    if (this.suggestedTerm) {
      this.invoice.term = this.suggestedTerm;
    }
  }

  loadStudents() {
    this.studentService.getStudents().subscribe({
      next: (data: any) => {
        this.students = data || [];
        this.filteredStudents = [];
      },
      error: (err: any) => {
        console.error('Error loading students:', err);
        this.error = 'Failed to load students';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  filterStudents() {
    if (!this.studentSearchQuery.trim()) {
      this.filteredStudents = [];
      return;
    }
    const query = this.studentSearchQuery.toLowerCase().trim();
    this.filteredStudents = this.students.filter(student => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const studentNumber = (student.studentNumber || '').toLowerCase();
      return fullName.includes(query) || studentNumber.includes(query);
    }).slice(0, 10); // Limit to 10 results
  }

  selectStudent(student: any) {
    this.invoice.studentId = student.id;
    this.selectedStudentData = student;
    this.studentSearchQuery = `${student.firstName} ${student.lastName} (${student.studentNumber})`;
    this.filteredStudents = [];
    this.calculateBalance();
    this.studentBalanceInfo = null;
    this.discountAmount = 0;
    // Set amount to 0 for Accountants (they can only invoice uniform items)
    if (this.isAccountant) {
      this.invoice.amount = 0;
    }
  }

  calculateBalance() {
    // Accountants cannot calculate balance for tuition fees (amount must be 0)
    if (this.isAccountant && this.invoice.amount > 0) {
      this.invoice.amount = 0;
      return;
    }
    
    if (this.invoice.studentId && this.invoice.amount && this.invoice.amount > 0) {
      this.financeService.calculateNextTermBalance(
        this.invoice.studentId,
        this.invoice.amount
      ).subscribe({
        next: (data: any) => {
          this.nextTermBalance = data;
        },
        error: (err: any) => {
          console.error('Error calculating balance:', err);
          this.nextTermBalance = null;
        }
      });
    } else {
      this.nextTermBalance = null;
    }
  }

  getUniformSubtotal(): number {
    return this.selectedUniformItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }

  getInvoiceGrandTotal(): number {
    return Number(this.invoice.amount || 0) + this.getUniformSubtotal();
  }

  getFinalInvoiceAmount(): number {
    const totalBeforeDiscount = this.getInvoiceGrandTotal();
    const discount = this.isSuperAdmin ? Number(this.discountAmount || 0) : 0;
    const finalTotal = totalBeforeDiscount - (isNaN(discount) ? 0 : discount);
    return finalTotal < 0 ? 0 : finalTotal;
  }

  fetchStudentBalance() {
    if (!this.invoice.studentId) {
      this.error = 'Please select a student first';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    this.fetchingBalance = true;
    this.financeService.getStudentBalance(this.invoice.studentId).subscribe({
      next: (data: any) => {
        this.fetchingBalance = false;
        this.studentBalanceInfo = data;
      },
      error: (err: any) => {
        this.fetchingBalance = false;
        this.error = err.error?.message || 'Failed to fetch student balance';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  addUniformItem() {
    if (!this.uniformSelection.itemId) {
      this.error = 'Please select a uniform item';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    const quantity = parseInt(String(this.uniformSelection.quantity), 10);
    if (isNaN(quantity) || quantity <= 0) {
      this.error = 'Quantity must be at least 1';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    const item = this.uniformItemsCatalog.find(i => i.id === this.uniformSelection.itemId);
    if (!item) {
      this.error = 'Selected uniform item not found';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    const unitPrice = parseFloat(String(item.unitPrice || 0));
    const lineTotal = unitPrice * quantity;

    const existingIndex = this.selectedUniformItems.findIndex(sel => sel.id === item.id);
    if (existingIndex >= 0) {
      this.selectedUniformItems[existingIndex].quantity += quantity;
      this.selectedUniformItems[existingIndex].lineTotal = this.selectedUniformItems[existingIndex].unitPrice * this.selectedUniformItems[existingIndex].quantity;
    } else {
      this.selectedUniformItems.push({
        id: item.id,
        name: item.name,
        quantity,
        unitPrice,
        lineTotal
      });
    }

    this.uniformSelection = { itemId: '', quantity: 1 };
  }

  removeUniformItem(itemId: string) {
    this.selectedUniformItems = this.selectedUniformItems.filter(item => item.id !== itemId);
  }

  updateUniformQuantity(item: any, newQuantity: number) {
    const quantity = parseInt(String(newQuantity), 10);
    if (isNaN(quantity) || quantity <= 0) {
      return;
    }
    item.quantity = quantity;
    item.lineTotal = item.unitPrice * quantity;
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.submitting = true;

    // Validate required fields
    if (!this.invoice.studentId) {
      this.error = 'Please select a student';
      this.submitting = false;
      return;
    }

    let baseAmount = Number(this.invoice.amount || 0);
    if (isNaN(baseAmount) || baseAmount < 0) {
      this.error = 'Base amount cannot be negative';
      this.submitting = false;
      return;
    }

    // Allow invoice with only uniform items (no base amount) for Accountants
    // SuperAdmin/Admin can also create invoices with only uniform items
    if (baseAmount === 0 && this.selectedUniformItems.length === 0) {
      this.error = 'Please enter a base amount or add uniform items to this invoice';
      this.submitting = false;
      return;
    }
    
    // Accountants cannot set base amount (tuition fees) - they can only invoice uniform items
    if (this.isAccountant && baseAmount > 0) {
      this.error = 'Accountants cannot create invoices for tuition fees. Please set amount to 0 and add uniform items only.';
      this.submitting = false;
      return;
    }

    if (!this.invoice.dueDate) {
      this.error = 'Please select a due date';
      this.submitting = false;
      return;
    }

    if (!this.invoice.term || !this.invoice.term.trim()) {
      this.error = 'Please enter a term';
      this.submitting = false;
      return;
    }

    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
      this.error = 'You must be logged in to create invoices. Please log in and try again.';
      this.submitting = false;
      return;
    }

    const uniformSubtotal = this.getUniformSubtotal();
    if (!this.isSuperAdmin) {
      this.discountAmount = 0;
    }
    const discount = this.isSuperAdmin ? Number(this.discountAmount || 0) : 0;
    if (discount < 0) {
      this.error = 'Discount cannot be negative';
      this.submitting = false;
      return;
    }

    const totalBeforeDiscount = baseAmount + uniformSubtotal;
    if (discount > totalBeforeDiscount) {
      this.error = 'Discount cannot exceed the total invoice amount';
      this.submitting = false;
      return;
    }

    const finalAmount = totalBeforeDiscount - discount;
    baseAmount = Number(baseAmount.toFixed(2));
    
    this.invoice.amount = baseAmount;

    const payload = {
      ...this.invoice,
      amount: Number(finalAmount.toFixed(2)),
      uniformItems: this.selectedUniformItems.map(item => ({
        itemId: item.id,
        quantity: item.quantity
      }))
    };

    if (this.isSuperAdmin && discount > 0) {
      const discountNote = `Discount applied: ${this.currencySymbol} ${discount.toFixed(2)}`;
      payload.description = payload.description
        ? `${payload.description}\n${discountNote}`
        : discountNote;
    }

    this.financeService.createInvoice(payload).subscribe({
      next: (response: any) => {
        this.success = 'Invoice created successfully';
        this.submitting = false;
        
        // Store invoice ID and number for PDF download
        if (response.invoice) {
          this.createdInvoiceId = response.invoice.id;
          this.createdInvoiceNumber = response.invoice.invoiceNumber;
        }
        
        // Clear form after successful creation
        this.invoice = {
          studentId: '',
          amount: 0,
          dueDate: '',
          term: '',
          description: ''
        };
        this.selectedStudentData = null;
        this.studentSearchQuery = '';
        this.nextTermBalance = null;
        this.selectedUniformItems = [];
        this.studentBalanceInfo = null;
        this.discountAmount = 0;
      },
      error: (err: any) => {
        this.submitting = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to create invoice';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  viewInvoicePDF() {
    if (!this.createdInvoiceId) {
      this.error = 'Invoice ID not available';
      return;
    }

    this.loadingPdf = true;
    this.error = '';
    
    this.financeService.getInvoicePDF(this.createdInvoiceId).subscribe({
      next: (result: { blob: Blob; filename: string }) => {
        // Create object URL for viewing
        if (this.pdfUrl) {
          window.URL.revokeObjectURL(this.pdfUrl);
        }
        this.pdfUrl = window.URL.createObjectURL(result.blob);
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfUrl);
        this.showPdfViewer = true;
        this.loadingPdf = false;
      },
      error: (err: any) => {
        this.loadingPdf = false;
        this.error = err.error?.message || 'Failed to load invoice PDF';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  downloadInvoicePDF() {
    if (!this.createdInvoiceId) {
      this.error = 'Invoice ID not available';
      return;
    }

    this.financeService.getInvoicePDF(this.createdInvoiceId).subscribe({
      next: (result: { blob: Blob; filename: string }) => {
        const url = window.URL.createObjectURL(result.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      },
      error: (err: any) => {
        console.error('Error downloading invoice PDF:', err);
        this.error = err.error?.message || 'Failed to download invoice PDF';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  closePdfViewer() {
    this.showPdfViewer = false;
    if (this.pdfUrl) {
      window.URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
      this.safePdfUrl = null;
    }
  }

  createNewInvoice() {
    // Close PDF viewer if open
    this.closePdfViewer();
    
    // Reset form for creating another invoice
    this.createdInvoiceId = null;
    this.createdInvoiceNumber = null;
    this.success = '';
    this.error = '';
    this.invoice = {
      studentId: '',
      amount: 0,
      dueDate: '',
      term: '',
      description: ''
    };
    this.selectedStudentData = null;
    this.studentSearchQuery = '';
    this.nextTermBalance = null;
  }
}
