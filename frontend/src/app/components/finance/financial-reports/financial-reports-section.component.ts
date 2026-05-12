import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-financial-reports-section',
  templateUrl: './financial-reports-section.component.html',
  styleUrls: ['./financial-reports-section.component.css'],
})
export class FinancialReportsSectionComponent implements OnInit {
  report = '';
  bundle: any = null;
  currencySymbol = '$';

  constructor(private route: ActivatedRoute, private settingsService: SettingsService) {}

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

    this.route.data.subscribe(d => {
      this.report = d['report'] || '';
      if ('bundle' in d) {
        this.bundle = d['bundle'] || null;
      }
    });
    this.route.parent?.data.subscribe(pd => {
      if (pd && 'bundle' in pd) {
        this.bundle = pd['bundle'] || null;
      }
    });
  }

  money(n: number | undefined | null): string {
    const x = Number(n);
    if (!Number.isFinite(x)) return '0.00';
    return x.toFixed(2);
  }

  objectKeys(obj: Record<string, unknown> | null | undefined): string[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).sort();
  }

  bucketLabel(key: string): string {
    switch (key) {
      case 'current0to30':
        return 'Current – 30 days';
      case 'days31to60':
        return '31 – 60 days';
      case 'days61to90':
        return '61 – 90 days';
      case 'days90Plus':
        return '90+ days';
      default:
        return key;
    }
  }

  /**
   * Strip the literal word "Form " from the start of a class key.
   * The backend already strips it when building the key, but this acts
   * as a safety net for any legacy keys still in the bundle.
   * "Form 1 Blue" → "1 Blue", "1 Blue" → "1 Blue" (no-op).
   */
  className(raw: string): string {
    return raw.replace(/^form\s+/i, '').trim() || raw;
  }

  // ── Outstanding Fees local filters ───────────────────────────────────────
  ofSearch = '';
  ofTerm = '';
  ofClass = '';
  ofResidence = '';

  get ofRows(): any[] {
    const rows: any[] = this.bundle?.outstandingFees ?? [];
    return rows.filter(r => {
      if (this.ofSearch) {
        const q = this.ofSearch.toLowerCase();
        const name = `${r.firstName} ${r.lastName}`.toLowerCase();
        if (!name.includes(q) && !String(r.studentNumber).toLowerCase().includes(q)) return false;
      }
      if (this.ofTerm && r.term !== this.ofTerm) return false;
      if (this.ofClass && r.className !== this.ofClass) return false;
      if (this.ofResidence && r.residence !== this.ofResidence) return false;
      return true;
    });
  }

  get ofTotalOutstanding(): number {
    return this.ofRows.reduce((s: number, r: any) => s + (r.balance ?? 0), 0);
  }

  get ofClassesAffected(): number {
    return new Set(this.ofRows.map((r: any) => r.className)).size;
  }

  get ofSummaryByClass(): { className: string; count: number; total: number }[] {
    const map = new Map<string, { count: number; total: number }>();
    for (const r of this.ofRows) {
      const key = r.className || '—';
      const existing = map.get(key) ?? { count: 0, total: 0 };
      map.set(key, { count: existing.count + 1, total: existing.total + (r.balance ?? 0) });
    }
    return Array.from(map.entries())
      .map(([className, v]) => ({ className, ...v }))
      .sort((a, b) => b.total - a.total);
  }

  ofUniqueTerms(): string[] {
    return [...new Set<string>((this.bundle?.outstandingFees ?? []).map((r: any) => r.term).filter(Boolean))].sort();
  }

  ofUniqueClasses(): string[] {
    return [...new Set<string>((this.bundle?.outstandingFees ?? []).map((r: any) => r.className).filter(Boolean))].sort();
  }

  ofUniqueResidences(): string[] {
    return [...new Set<string>((this.bundle?.outstandingFees ?? []).map((r: any) => r.residence).filter(Boolean))].sort();
  }

  clearOfFilters(): void {
    this.ofSearch = '';
    this.ofTerm = '';
    this.ofClass = '';
    this.ofResidence = '';
  }

  printPage(): void { window.print(); }

  downloadOfCsv(): void {
    const rows = this.ofRows;
    if (!rows.length) return;
    const headers = ['#', 'Name', 'Class', 'Residence', 'Term', 'Invoice', 'Due Date', 'Balance'];
    const lines = rows.map((r: any, i: number) =>
      [i + 1, `${r.firstName} ${r.lastName}`, r.className, r.residence, r.term, r.invoiceNumber, r.dueDate, r.balance].join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'outstanding-fees.csv';
    a.click();
  }
}
