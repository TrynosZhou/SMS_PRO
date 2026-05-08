import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';

type ExemptionKind = 'fixed' | 'percentage' | 'staff_sibling';

@Component({
  selector: 'app-exemption-management',
  templateUrl: './exemption-management.component.html',
  styleUrls: ['./exemption-management.component.css'],
})
export class ExemptionManagementComponent implements OnInit, OnDestroy {
  currencySymbol = '$';

  studentSearchQuery = '';
  filteredStudents: any[] = [];
  selectedStudent: any = null;

  exemptionType: ExemptionKind = 'fixed';
  valueNum = 0;
  description = '';

  exemptionsList: any[] = [];
  loadingList = false;
  saving = false;
  error = '';
  success = '';

  editingId: string | null = null;

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private studentService: StudentService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        this.currencySymbol = row?.currencySymbol || '$';
      },
      error: () => {
        this.currencySymbol = '$';
      },
    });

    this.search$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((q) => {
          const t = q.trim();
          if (!t) {
            return of([]);
          }
          return this.studentService.getStudents({ search: t, page: 1, limit: 24 });
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((data: any) => {
        const list = Array.isArray(data) ? data : data?.data ?? [];
        this.filteredStudents = list;
      });

    this.loadExemptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(value: string): void {
    this.search$.next(value);
  }

  selectStudent(student: any): void {
    this.selectedStudent = student;
    this.studentSearchQuery = `${student.firstName} ${student.lastName} (${student.studentNumber})`;
    this.filteredStudents = [];
  }

  clearStudent(): void {
    this.selectedStudent = null;
    this.studentSearchQuery = '';
    this.filteredStudents = [];
  }

  setExemptionType(t: ExemptionKind): void {
    this.exemptionType = t;
    if (t === 'staff_sibling') {
      this.valueNum = 0;
    }
  }

  loadExemptions(): void {
    this.loadingList = true;
    this.financeService.getFeeExemptions().subscribe({
      next: (res: any) => {
        this.exemptionsList = res?.exemptions ?? [];
        this.loadingList = false;
      },
      error: (err: any) => {
        this.loadingList = false;
        this.error = err.error?.message || 'Failed to load exemptions';
      },
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.exemptionType = 'fixed';
    this.valueNum = 0;
    this.description = '';
    this.clearStudent();
    this.success = '';
    this.error = '';
  }

  startEdit(row: any): void {
    this.editingId = row.id;
    this.exemptionType = row.exemptionType;
    this.valueNum = Number(row.value) || 0;
    this.description = row.description || '';
    const s = row.student;
    if (s) {
      this.selectedStudent = s;
      this.studentSearchQuery = `${s.firstName} ${s.lastName} (${s.studentNumber})`;
    } else {
      this.clearStudent();
    }
    this.filteredStudents = [];
    this.error = '';
    this.success = '';
  }

  submit(): void {
    this.error = '';
    this.success = '';

    if (!this.editingId && !this.selectedStudent?.id) {
      this.error = 'Please search and select a student.';
      return;
    }

    if (this.exemptionType === 'fixed' && (this.valueNum == null || this.valueNum <= 0)) {
      this.error = 'Enter a fixed amount greater than zero.';
      return;
    }
    if (
      this.exemptionType === 'percentage' &&
      (this.valueNum == null || this.valueNum <= 0 || this.valueNum > 100)
    ) {
      this.error = 'Enter a percentage between 1 and 100.';
      return;
    }

    this.saving = true;
    const payloadBase = {
      exemptionType: this.exemptionType,
      value: this.exemptionType === 'staff_sibling' ? 0 : this.valueNum,
      description: this.description.trim() || null,
      isActive: true,
    };

    const req$ = this.editingId
      ? this.financeService.updateFeeExemption(this.editingId, payloadBase)
      : this.financeService.createFeeExemption({
          studentId: this.selectedStudent.id,
          ...payloadBase,
        });

    req$.subscribe({
      next: (res: any) => {
        this.saving = false;
        const n = res?.invoicesRecalculated;
        const recalcMsg =
          typeof n === 'number' && n > 0 ? ` ${n} open invoice(s) updated to match exemptions.` : '';
        this.success = (this.editingId ? 'Exemption updated.' : 'Exemption saved.') + recalcMsg;
        this.resetForm();
        this.loadExemptions();
        setTimeout(() => (this.success = ''), 8000);
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err.error?.message || 'Could not save exemption';
      },
    });
  }

  recalculating = false;

  recalculateInvoicesForSelectedStudent(): void {
    this.error = '';
    this.success = '';
    const id = this.selectedStudent?.id;
    const num = this.selectedStudent?.studentNumber;
    if (!id && !num) {
      this.error = 'Select a student first (search and pick from the list).';
      return;
    }
    this.recalculating = true;
    const payload: { studentId?: string; studentNumber?: string } = id
      ? { studentId: id }
      : { studentNumber: String(num) };
    this.financeService.recalculateOpenFeeInvoices(payload).subscribe({
      next: (res: any) => {
        this.recalculating = false;
        const u = res?.updated ?? 0;
        this.success =
          u > 0
            ? `${res?.message || 'Done.'} Balance screens will reflect new amounts.`
            : res?.message || 'No open invoices were updated.';
        if (Array.isArray(res?.errors) && res.errors.length) {
          this.error = res.errors.join(' ');
        }
        setTimeout(() => {
          this.success = '';
          this.error = '';
        }, 10000);
      },
      error: (err: any) => {
        this.recalculating = false;
        this.error = err.error?.message || 'Recalculation failed';
      },
    });
  }

  deactivate(row: any): void {
    if (!confirm(`Remove exemption for ${row.student?.firstName} ${row.student?.lastName}?`)) {
      return;
    }
    this.financeService.removeFeeExemption(row.id).subscribe({
      next: (res: any) => {
        const n = res?.invoicesRecalculated;
        if (typeof n === 'number' && n > 0) {
          this.success = `Exemption removed. ${n} open invoice(s) recalculated.`;
          setTimeout(() => (this.success = ''), 8000);
        }
        this.loadExemptions();
        if (this.editingId === row.id) {
          this.resetForm();
        }
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to remove exemption';
      },
    });
  }

  typeLabel(t: string): string {
    switch (t) {
      case 'fixed':
        return 'Fixed amount';
      case 'percentage':
        return 'Percentage';
      case 'staff_sibling':
        return 'Staff sibling';
      default:
        return t;
    }
  }

  formatValue(row: any): string {
    if (row.exemptionType === 'staff_sibling') {
      return 'Tuition / desk / reg. waived';
    }
    if (row.exemptionType === 'percentage') {
      return `${Number(row.value)}%`;
    }
    return `${this.currencySymbol}${Number(row.value).toFixed(2)}`;
  }
}
