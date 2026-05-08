import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PayrollService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // Employees
  getEmployees(params?: { search?: string; department?: string; status?: string }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.search) httpParams = httpParams.set('search', params.search);
    if (params?.department) httpParams = httpParams.set('department', params.department);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    return this.http.get(`${this.apiUrl}/payroll/employees`, { params: httpParams });
  }

  createEmployee(body: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/employees`, body);
  }

  updateEmployee(id: string, body: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/payroll/employees/${id}`, body);
  }

  deleteEmployee(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/payroll/employees/${id}`);
  }

  // Salary structures
  getSalaryStructures(params?: { salaryType?: string }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.salaryType) httpParams = httpParams.set('salaryType', params.salaryType);
    return this.http.get(`${this.apiUrl}/payroll/salary-structures`, { params: httpParams });
  }

  createOrUpdateSalaryStructure(body: any, id?: string): Observable<any> {
    if (id) {
      return this.http.put(`${this.apiUrl}/payroll/salary-structures/${id}`, body);
    }
    return this.http.post(`${this.apiUrl}/payroll/salary-structures`, body);
  }

  // Runs
  /** Generates for the given month/year (defaults to current month on the server if omitted). */
  generateRun(body?: { notes?: string; month?: number; year?: number }): Observable<any> {
    const payload: { notes?: string; month?: number; year?: number } = {};
    if (body?.notes != null && String(body.notes).trim() !== '') {
      payload.notes = String(body.notes).trim();
    }
    if (body?.month != null && body?.year != null) {
      payload.month = Number(body.month);
      payload.year = Number(body.year);
    }
    return this.http.post(`${this.apiUrl}/payroll/runs/generate`, payload);
  }

  getRuns(params?: { month?: number; year?: number }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.month) httpParams = httpParams.set('month', String(params.month));
    if (params?.year) httpParams = httpParams.set('year', String(params.year));
    return this.http.get(`${this.apiUrl}/payroll/runs`, { params: httpParams });
  }

  getRunDetails(runId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/payroll/runs/${runId}`);
  }

  adjustLine(runId: string, body: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/runs/${runId}/adjust`, body);
  }

  approveRun(runId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/runs/${runId}/approve`, {});
  }

  payRun(runId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/runs/${runId}/pay`, {});
  }

  // Payslips
  getPayslips(params?: { runId?: string }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.runId) httpParams = httpParams.set('runId', params.runId);
    return this.http.get(`${this.apiUrl}/payroll/payslips`, { params: httpParams });
  }

  downloadPayslip(payslipId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/payroll/payslips/${payslipId}/download`, {
      responseType: 'blob'
    });
  }

  /** Opens PDF preview (same layout as saved payslip; works for draft or approved runs). */
  previewPayslipLine(runId: string, lineId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/payroll/runs/${runId}/lines/${lineId}/preview-payslip`, {
      responseType: 'blob'
    });
  }

  // Reports
  getMonthlySummary(params: { month: number; year: number }): Observable<any> {
    const httpParams = new HttpParams()
      .set('month', String(params.month))
      .set('year', String(params.year));
    return this.http.get(`${this.apiUrl}/payroll/reports/monthly-summary`, { params: httpParams });
  }

  getDepartmentReport(params: { month: number; year: number; department?: string }): Observable<any> {
    let httpParams = new HttpParams()
      .set('month', String(params.month))
      .set('year', String(params.year));
    if (params.department) httpParams = httpParams.set('department', params.department);
    return this.http.get(`${this.apiUrl}/payroll/reports/department`, { params: httpParams });
  }

  // Leave management
  getLeaveDashboard(params?: {
    asOfDate?: string;
    from?: string;
    to?: string;
    category?: 'all' | 'teaching' | 'ancillary';
    employeeId?: string;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.asOfDate) httpParams = httpParams.set('asOfDate', params.asOfDate);
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    if (params?.category) httpParams = httpParams.set('category', params.category);
    if (params?.employeeId) httpParams = httpParams.set('employeeId', params.employeeId);
    return this.http.get(`${this.apiUrl}/payroll/leave/dashboard`, { params: httpParams });
  }

  createLeaveRecord(body: {
    staffType: 'teaching' | 'ancillary';
    staffId: string;
    leaveDate: string;
    days: number;
    reason?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/leave/records`, body);
  }

  getLeaveRecords(params?: {
    staffType?: 'all' | 'teaching' | 'ancillary';
    staffId?: string;
    from?: string;
    to?: string;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.staffType) httpParams = httpParams.set('staffType', params.staffType);
    if (params?.staffId) httpParams = httpParams.set('staffId', params.staffId);
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    return this.http.get(`${this.apiUrl}/payroll/leave/records`, { params: httpParams });
  }

  getLeaveDepartmentSummary(params?: {
    asOfDate?: string;
    from?: string;
    to?: string;
    category?: 'all' | 'teaching' | 'ancillary';
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.asOfDate) httpParams = httpParams.set('asOfDate', params.asOfDate);
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    if (params?.category) httpParams = httpParams.set('category', params.category);
    return this.http.get(`${this.apiUrl}/payroll/leave/reports/department-summary`, { params: httpParams });
  }

  getLeaveLiabilityReport(params?: {
    asOfDate?: string;
    category?: 'all' | 'teaching' | 'ancillary';
    employeeId?: string;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.asOfDate) httpParams = httpParams.set('asOfDate', params.asOfDate);
    if (params?.category) httpParams = httpParams.set('category', params.category);
    if (params?.employeeId) httpParams = httpParams.set('employeeId', params.employeeId);
    return this.http.get(`${this.apiUrl}/payroll/leave/reports/liability`, { params: httpParams });
  }

  getLeavePolicy(): Observable<any> {
    return this.http.get(`${this.apiUrl}/payroll/leave/policy`);
  }

  updateLeavePolicy(body: {
    annualLeaveDaysPerYear: number;
    excessAccruedThresholdDays: number;
    maxAccrualDays?: number | null;
    carryForwardCapDays?: number | null;
    teachingTermMonths?: number[];
    notes?: string;
  }): Observable<any> {
    return this.http.put(`${this.apiUrl}/payroll/leave/policy`, body);
  }

  createLeaveLiabilityAudit(body?: { asOfDate?: string; category?: string; employeeId?: string; notes?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/payroll/leave/reports/liability/audit`, body || {});
  }

  getLeaveLiabilityAudits(params?: { from?: string; to?: string; category?: string; employeeId?: string }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    if (params?.category) httpParams = httpParams.set('category', params.category);
    if (params?.employeeId) httpParams = httpParams.set('employeeId', params.employeeId);
    return this.http.get(`${this.apiUrl}/payroll/leave/reports/liability/audits`, { params: httpParams });
  }
}

