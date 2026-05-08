import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PayrollService } from '../../../services/payroll.service';

@Component({
  selector: 'app-salary-assignments',
  templateUrl: './salary-assignments.component.html',
  styleUrls: ['./salary-assignments.component.css']
})
export class SalaryAssignmentsComponent implements OnInit {
  initialLoading = true;
  saving = false;
  error = '';
  success = '';
  employees: any[] = [];
  structures: any[] = [];

  selectedEmployeeId: string | null = null;
  selectedStructureId: string | null = null;
  effectiveFrom = '';

  constructor(
    private payroll: PayrollService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const d = new Date();
    this.effectiveFrom = d.toISOString().slice(0, 10);
    this.loadData(false);
  }

  loadData(silent = false): void {
    if (!silent) {
      this.initialLoading = true;
      this.error = '';
    }
    forkJoin({
      employees: this.payroll.getEmployees(),
      structures: this.payroll.getSalaryStructures()
    }).subscribe({
      next: (res: any) => {
        this.employees = res.employees?.employees || [];
        const raw = res.structures?.structures || res.structures?.salaryStructures || [];
        this.structures = (raw || []).filter((s: any) => s?.isActive !== false);
        if (!silent) this.initialLoading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || err?.message || 'Failed to load data';
        if (!silent) this.initialLoading = false;
      }
    });
  }

  isAssigned(e: any): boolean {
    return String(e?.salaryType || '').trim().length > 0;
  }

  /** All payroll employees (including teachers synced from the Teachers module). */
  get filteredEmployees(): any[] {
    return this.employees;
  }

  get activeStructures(): any[] {
    return this.structures;
  }

  get totalAssignments(): number {
    return this.filteredEmployees.filter((e) => this.isAssigned(e)).length;
  }

  get payrollStaffCount(): number {
    return this.filteredEmployees.length;
  }

  get unassignedStaffCount(): number {
    return this.filteredEmployees.filter((e) => !this.isAssigned(e)).length;
  }

  get withLoanBalance(): number {
    return this.filteredEmployees.filter((e) => Number(e?.loanBalance || 0) > 0).length;
  }

  assignSalary(): void {
    this.error = '';
    this.success = '';
    if (!this.selectedEmployeeId || !this.selectedStructureId) {
      this.error = 'Please select an employee and a salary structure.';
      return;
    }
    const struct = this.structures.find((s) => s.id === this.selectedStructureId);
    if (!struct) {
      this.error = 'Invalid salary structure.';
      return;
    }
    this.saving = true;
    this.payroll
      .updateEmployee(this.selectedEmployeeId, {
        salaryType: struct.salaryType,
        salaryEffectiveFrom: this.effectiveFrom || null
      })
      .subscribe({
        next: () => {
          this.success = 'Salary assigned successfully.';
          this.saving = false;
          this.selectedEmployeeId = null;
          this.selectedStructureId = null;
          this.loadData(true);
        },
        error: (err: any) => {
          this.error = err?.error?.message || err?.message || 'Failed to assign salary';
          this.saving = false;
        }
      });
  }

  back(): void {
    this.router.navigate(['/payroll']);
  }
}
