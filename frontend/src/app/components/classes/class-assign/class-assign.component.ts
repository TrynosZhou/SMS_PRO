import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-class-assign',
  templateUrl: './class-assign.component.html',
  styleUrls: ['./class-assign.component.css'],
})
export class ClassAssignComponent implements OnInit {
  readonly miniGridIdx = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

  classes: any[] = [];
  selected: any | null = null;
  loading = false;
  error = '';

  timeOffOpen = false;
  timeOffLoading = false;
  timeOffSaving = false;
  timeOffError = '';
  timeOffDayLabels: string[] = [];
  timeOffPeriodLabels: string[] = [];
  /** cells[dayIndex][periodIndex] — 0 available, 1 conditional, 2 time off */
  timeOffCells: number[][] = [];
  timeOffFlash = '';

  constructor(
    private classService: ClassService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.pageload();
  }

  pageload(): void {
    this.loading = true;
    this.error = '';
    this.classService.getClasses({ limit: 500 }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.classes = this.classService.sortClasses(list);
        this.loading = false;
      },
      error: (err: any) => {
        this.error =
          err?.error?.message || err?.message || 'Failed to load classes.';
        this.loading = false;
        this.classes = [];
      },
    });
  }

  selectRow(c: any, ev?: Event): void {
    ev?.stopPropagation();
    this.selected = c;
  }

  openLessons(c: any): void {
    if (!c?.id) {
      return;
    }
    this.router.navigate(['/classes/manage/assign-teachers', c.id, 'lessons']);
  }

  /** Single click: select only (enables sidebar actions). */
  onRowClick(c: any): void {
    this.selectRow(c);
  }

  goNew(): void {
    this.router.navigate(['/classes/manage/add-new']);
  }

  goEdit(): void {
    if (!this.selected?.id) {
      return;
    }
    this.router.navigate(['/classes/manage/edit', this.selected.id]);
  }

  removeSelected(): void {
    if (!this.selected?.id) {
      return;
    }
    const name = this.selected.name || 'this class';
    if (!confirm(`Remove class "${name}"? This cannot be undone if the class is in use.`)) {
      return;
    }
    this.classService.deleteClass(this.selected.id).subscribe({
      next: () => {
        this.selected = null;
        this.pageload();
      },
      error: (err: any) => {
        alert(err?.error?.message || err?.message || 'Could not delete class.');
      },
    });
  }

  studentCount(c: any): number {
    const n = c?.students?.length;
    if (typeof n === 'number') {
      return n;
    }
    return c?.studentCount ?? 0;
  }

  subjectCount(c: any): number {
    const n = c?.subjects?.length;
    return typeof n === 'number' ? n : 0;
  }

  openTimeOff(): void {
    if (!this.selected?.id) {
      return;
    }
    this.timeOffOpen = true;
    this.timeOffError = '';
    this.timeOffFlash = '';
    this.loadTimeOff();
  }

  closeTimeOff(): void {
    this.timeOffOpen = false;
    this.timeOffError = '';
    this.timeOffFlash = '';
  }

  loadTimeOff(): void {
    if (!this.selected?.id) {
      return;
    }
    this.timeOffLoading = true;
    this.timeOffError = '';
    this.classService.getClassTimeOff(this.selected.id).subscribe({
      next: (res: any) => {
        this.timeOffDayLabels = res?.dayLabels || [];
        this.timeOffPeriodLabels = res?.periodLabels || [];
        this.timeOffCells = this.cloneGrid(res?.cells || []);
        this.timeOffLoading = false;
      },
      error: (err: any) => {
        this.timeOffError =
          err?.error?.message || err?.message || 'Could not load time off.';
        this.timeOffLoading = false;
        this.timeOffDayLabels = [];
        this.timeOffPeriodLabels = [];
        this.timeOffCells = [];
      },
    });
  }

  private cloneGrid(cells: number[][]): number[][] {
    return (cells || []).map((row) => (Array.isArray(row) ? [...row] : []));
  }

  /** Left click / forward: available → time off → conditional → available */
  onTimeOffCellClick(d: number, p: number): void {
    this.cycleCell(d, p, 1);
  }

  onTimeOffCellContextMenu(ev: Event, d: number, p: number): void {
    ev.preventDefault();
    this.cycleCell(d, p, -1);
  }

  private cycleCell(d: number, p: number, delta: number): void {
    if (!this.timeOffCells[d] || this.timeOffCells[d][p] === undefined) {
      return;
    }
    const order = [0, 2, 1];
    const cur = this.timeOffCells[d][p];
    let idx = order.indexOf(cur);
    if (idx < 0) {
      idx = 0;
    }
    const next = order[(idx + delta + order.length * 10) % order.length];
    const row = [...this.timeOffCells[d]];
    row[p] = next;
    this.timeOffCells = this.timeOffCells.map((r, i) => (i === d ? row : [...r]));
  }

  toggleTimeOffRow(d: number): void {
    const row = this.timeOffCells[d];
    if (!row) {
      return;
    }
    const allOff = row.every((v) => v === 2);
    const next = allOff ? 0 : 2;
    this.timeOffCells = this.timeOffCells.map((r, i) =>
      i === d ? r.map(() => next) : [...r]
    );
  }

  toggleTimeOffColumn(p: number): void {
    const allOff = this.timeOffCells.every((row) => row[p] === 2);
    const next = allOff ? 0 : 2;
    this.timeOffCells = this.timeOffCells.map((row) => {
      const copy = [...row];
      copy[p] = next;
      return copy;
    });
  }

  timeOffCellClass(v: number): string {
    if (v === 2) {
      return 'ctf-x';
    }
    if (v === 1) {
      return 'ctf-q';
    }
    return 'ctf-ok';
  }

  timeOffCellLabel(v: number): string {
    if (v === 2) {
      return '✗';
    }
    if (v === 1) {
      return '?';
    }
    return '✓';
  }

  saveTimeOff(closeAfter: boolean): void {
    if (!this.selected?.id || this.timeOffSaving) {
      return;
    }
    this.timeOffSaving = true;
    this.timeOffError = '';
    this.timeOffFlash = '';
    this.classService.saveClassTimeOff(this.selected.id, this.timeOffCells).subscribe({
      next: (res: any) => {
        this.timeOffCells = this.cloneGrid(res?.cells || this.timeOffCells);
        this.timeOffSaving = false;
        this.timeOffFlash = closeAfter ? '' : 'Saved. You can keep editing or pick another class.';
        if (closeAfter) {
          this.closeTimeOff();
        }
      },
      error: (err: any) => {
        this.timeOffSaving = false;
        this.timeOffError =
          err?.error?.message || err?.message || 'Could not save time off.';
      },
    });
  }
}
