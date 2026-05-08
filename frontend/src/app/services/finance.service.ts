import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FinanceService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getInvoices(studentId?: string, status?: string, page?: number, limit?: number, search?: string): Observable<any> {
    const params: any = {};
    if (studentId) params.studentId = studentId;
    if (status) params.status = status;
    if (page) params.page = String(page);
    if (limit) params.limit = String(limit);
    if (search) params.search = search;
    return this.http.get(`${this.apiUrl}/finance`, { params });
  }

  createInvoice(invoice: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance`, invoice);
  }

  updatePayment(invoiceId: string, paymentData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/finance/${invoiceId}/payment`, paymentData);
  }

  calculateNextTermBalance(studentId: string, nextTermAmount: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/calculate-balance`, { studentId, nextTermAmount });
  }

  createBulkInvoices(term: string, dueDate: string, description?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/bulk`, { term, dueDate, description });
  }

  getStudentBalance(studentId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance/balance`, { params: { studentId } });
  }

  getInvoice(invoiceId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance`, { params: { invoiceId } });
  }

  getInvoicePDF(invoiceId: string): Observable<{ blob: Blob; filename: string }> {
    return this.http.get(`${this.apiUrl}/finance/${invoiceId}/pdf`, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map((response: any) => {
        const blob = response.body as Blob;
        let filename = 'Invoice.pdf';
        
        // Extract filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
          }
        }
        
        return { blob, filename };
      })
    );
  }

  /**
   * Saves the PDF only when the user explicitly chooses download (e.g. button click).
   * Does not open a new tab and does not auto-preview.
   */
  downloadInvoicePdfFile(blob: Blob, filename = 'invoice.pdf'): void {
    const pdfBlob =
      blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'invoice.pdf';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(url), 3000);
  }

  getReceiptPDF(invoiceId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/finance/${invoiceId}/receipt`, {
      responseType: 'blob'
    });
  }

  getOutstandingBalances(): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance/outstanding-balances`);
  }

  /** Aggregated data for Finance → Manage → Financial Reports (all sub-views). */
  getFinancialReports(): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance/financial-reports`);
  }

  /**
   * Correct prepaid carry-forward for a student's invoices.
   * Recalculates subsequent invoices based on a corrected remaining prepaid amount.
   */
  correctPrepaid(payload: {
    studentId: string;
    fromInvoiceId: string;
    correctedPrepaidAmount: number;
    strategy?: 'carryOutOnly';
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/correct-prepaid`, payload);
  }

  /**
   * Apply a credit note (tuition reduction) for a student who was overcharged.
   * Reduces the latest invoice balance. Excess credit is carried forward as prepaid for the next term.
   */
  applyCreditNote(studentId: string, creditAmount: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/credit-note`, { studentId, creditAmount });
  }

  /**
   * Apply a debit note (correction for undercharge) for a student.
   * Adds the debit amount to the latest invoice balance.
   */
  applyDebitNote(studentId: string, debitAmount: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/debit-note`, { studentId, debitAmount });
  }

  /**
   * Add uniform line items to the student's latest invoice.
   * billingMode: 'invoice' (bill to balance) | 'cash' (paid immediately, shown on invoice).
   */
  addUniformToInvoice(payload: {
    studentId: string;
    uniformItems: Array<{ itemId: string; quantity: number }>;
    billingMode: 'invoice' | 'cash';
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/add-uniform`, payload);
  }

  getFeeExemptions(studentId?: string): Observable<any> {
    const params: Record<string, string> = {};
    if (studentId) params['studentId'] = studentId;
    return this.http.get(`${this.apiUrl}/finance/exemptions`, { params });
  }

  createFeeExemption(body: {
    studentId: string;
    exemptionType: string;
    value: number;
    description?: string | null;
    isActive?: boolean;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/exemptions`, body);
  }

  updateFeeExemption(
    id: string,
    body: {
      exemptionType?: string;
      value?: number;
      description?: string | null;
      isActive?: boolean;
    }
  ): Observable<any> {
    return this.http.put(`${this.apiUrl}/finance/exemptions/${id}`, body);
  }

  removeFeeExemption(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/finance/exemptions/${id}`);
  }

  /** Re-run Manage Fees + exemptions on all open invoices for a student (UUID or studentNumber). */
  recalculateOpenFeeInvoices(body: { studentId?: string; studentNumber?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/exemptions/recalculate-invoices`, body);
  }
}

