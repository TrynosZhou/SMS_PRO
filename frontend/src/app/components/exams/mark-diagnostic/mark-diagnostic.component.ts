import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { SettingsService } from '../../../services/settings.service';

// ── Domain types (only the fields we actually read from the API) ──────────
interface ClassRow {
  id: string;
  name: string;
  form?: string;
  isActive?: boolean;
}

interface SubjectRow {
  id: string;
  name: string;
  code?: string;
}

interface TermRow {
  id: string;
  termNumber?: number | string;
  year?: number | string;
  label: string;
  status?: string;
}

interface MarkRow {
  id: string;
  examId: string;
  studentId: string;
  subjectId: string;
  score: number;
  maxScore: number;
  exam?: any;
  student?: any;
  subject?: any;
}

// ── Computed shapes used by the template ──────────────────────────────────
interface SubjectOverview {
  subjectId: string;
  subjectName: string;
  count: number;
  avg: number;
  high: number;
  low: number;
  passCount: number;
  failCount: number;
  passRate: number; // percentage
}

interface DistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  pct: number;
  color: string;
}

interface AtRiskStudent {
  studentId: string;
  fullName: string;
  className: string;
  avgPct: number;
  belowCount: number;   // # of subjects below threshold
  totalCount: number;   // # of subject results
}

interface StudentTrendPoint {
  label: string;        // exam label, e.g. "Term 1 · Mid Term"
  examDate: string;     // ISO
  subjectName: string;
  score: number;
  maxScore: number;
  pct: number;
}

interface WeakAssessment {
  examId: string;
  examName: string;
  subjectName: string;
  term: string;
  type: string;
  avgPct: number;
  count: number;
}

interface ComparativeRow {
  classId: string;
  className: string;
  count: number;
  avgPct: number;
  passRate: number;
}

type DiagnosticSection =
  | 'overview'
  | 'student'
  | 'risk'
  | 'distribution'
  | 'weakness'
  | 'comparative';

@Component({
  selector: 'app-mark-diagnostic',
  templateUrl: './mark-diagnostic.component.html',
  styleUrls: ['./mark-diagnostic.component.css']
})
export class MarkDiagnosticComponent implements OnInit {
  // ── Filters (drive all derived diagnostics) ─────────────────────────────
  filters = {
    year: '' as string,        // optional, derived from term/exam.examDate
    term: '' as string,        // term label
    classId: '' as string,
    subjectId: '' as string,
    examType: '' as string,    // mid_term | end_term (or any value present in data)
    passMark: 50               // percentage threshold for "at risk" + pass/fail
  };

  // ── Reference data ──────────────────────────────────────────────────────
  classes: ClassRow[] = [];
  subjects: SubjectRow[] = [];
  terms: TermRow[] = [];

  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];

  // ── Raw marks loaded from the backend ───────────────────────────────────
  marks: MarkRow[] = [];

  // ── UI state ────────────────────────────────────────────────────────────
  loading = false;
  error = '';
  activeSection: DiagnosticSection = 'overview';

  // Selected student for the Student Performance section
  selectedStudentId = '';

  // ── Cached computations for the current filter set ──────────────────────
  filteredMarks: MarkRow[] = [];
  subjectOverview: SubjectOverview[] = [];
  distribution: DistributionBucket[] = [];
  atRiskStudents: AtRiskStudent[] = [];
  weakAssessments: WeakAssessment[] = [];
  comparative: ComparativeRow[] = [];
  studentList: Array<{ id: string; label: string; classId: string }> = [];
  studentTrend: StudentTrendPoint[] = [];
  studentSummary: {
    studentName: string;
    className: string;
    subjects: Array<{ subjectName: string; avgPct: number; count: number; trend: 'up' | 'down' | 'flat' }>;
    overallAvg: number;
    direction: 'up' | 'down' | 'flat';
  } | null = null;

  // ── Top-line KPIs for the page banner ───────────────────────────────────
  kpi = {
    studentsAnalysed: 0,
    avgPct: 0,
    passRate: 0,
    atRiskCount: 0
  };

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.loadReferenceData();
    this.loadAllMarks();
  }

  // ── Loaders ─────────────────────────────────────────────────────────────
  private loadReferenceData(): void {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list: any[] = Array.isArray(data) ? data : data?.classes || [];
        this.classes = list.map((c) => ({ id: c.id, name: c.name, form: c.form, isActive: c.isActive }));
      },
      error: () => (this.classes = [])
    });

    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        const list: any[] = Array.isArray(data) ? data : data?.subjects || [];
        this.subjects = list.map((s) => ({ id: s.id, name: s.name, code: s.code }));
      },
      error: () => (this.subjects = [])
    });

    this.settingsService.getTerms().subscribe({
      next: (data: any) => {
        const list: any[] = Array.isArray(data) ? data : data?.terms || [];
        this.terms = list.map((t) => ({
          ...t,
          label: t.label || `Term ${t.termNumber} ${t.year}`
        }));
      },
      error: () => (this.terms = [])
    });
  }

  private loadAllMarks(): void {
    this.loading = true;
    this.error = '';
    this.examService.getMarks().subscribe({
      next: (data: any) => {
        const list: any[] = Array.isArray(data) ? data : data?.marks || data?.data || [];
        this.marks = list.map((m) => ({
          id: m.id,
          examId: m.examId || m.exam?.id,
          studentId: m.studentId || m.student?.id,
          subjectId: m.subjectId || m.subject?.id,
          score: Number(m.score) || 0,
          maxScore: Number(m.maxScore) || 100,
          exam: m.exam || null,
          student: m.student || null,
          subject: m.subject || null
        }));
        this.recomputeAll();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to load marks data.';
        this.marks = [];
        this.recomputeAll();
        this.loading = false;
      }
    });
  }

  // ── Years available in data (from exam.examDate or term.year) ───────────
  get availableYears(): string[] {
    const years = new Set<string>();
    this.marks.forEach((m) => {
      const d = m.exam?.examDate;
      if (d) {
        const y = String(new Date(d).getFullYear() || '');
        if (y) years.add(y);
      }
    });
    this.terms.forEach((t) => {
      if (t.year) years.add(String(t.year));
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }

  // ── Section / filter handlers ───────────────────────────────────────────
  setSection(section: DiagnosticSection): void {
    this.activeSection = section;
    if (section === 'student') {
      this.recomputeStudent();
    }
  }

  onFilterChange(): void {
    this.recomputeAll();
  }

  refresh(): void {
    this.loadAllMarks();
  }

  // ── Core: compute filtered slice + every diagnostic ─────────────────────
  private recomputeAll(): void {
    this.filteredMarks = this.applyFilters(this.marks);

    this.subjectOverview = this.computeOverviewBySubject(this.filteredMarks);
    this.distribution = this.computeDistribution(this.filteredMarks);
    this.atRiskStudents = this.computeAtRiskStudents(this.filteredMarks);
    this.weakAssessments = this.computeWeakAssessments(this.filteredMarks);
    this.comparative = this.computeComparative();

    this.studentList = this.buildStudentList(this.filteredMarks);
    if (this.selectedStudentId && !this.studentList.find((s) => s.id === this.selectedStudentId)) {
      this.selectedStudentId = '';
    }
    this.recomputeStudent();

    this.kpi = this.computeKPI(this.filteredMarks, this.atRiskStudents);
  }

  private applyFilters(rows: MarkRow[]): MarkRow[] {
    const { year, term, classId, subjectId, examType } = this.filters;
    return rows.filter((m) => {
      if (year) {
        const d = m.exam?.examDate;
        const y = d ? String(new Date(d).getFullYear()) : '';
        // also accept the year captured in the exam.term string ("Term X YYYY")
        const fromTerm = m.exam?.term ? (m.exam.term.match(/(\d{4})/)?.[1] || '') : '';
        if (y !== year && fromTerm !== year) return false;
      }
      if (term && m.exam?.term && m.exam.term !== term) return false;
      if (classId && m.exam?.classId !== classId && m.student?.classId !== classId) return false;
      if (subjectId && m.subjectId !== subjectId) return false;
      if (examType && m.exam?.type !== examType) return false;
      return true;
    });
  }

  // ── 1. Performance Overview Dashboard ───────────────────────────────────
  private computeOverviewBySubject(rows: MarkRow[]): SubjectOverview[] {
    const buckets = new Map<string, MarkRow[]>();
    rows.forEach((m) => {
      const key = m.subjectId;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(m);
    });

    const overviews: SubjectOverview[] = [];
    buckets.forEach((list, subjectId) => {
      const pcts = list.map((m) => this.pct(m));
      const avg = this.mean(pcts);
      const high = Math.max(...pcts);
      const low = Math.min(...pcts);
      const pass = pcts.filter((p) => p >= this.filters.passMark).length;
      overviews.push({
        subjectId,
        subjectName: list[0]?.subject?.name || this.subjects.find((s) => s.id === subjectId)?.name || 'Unknown',
        count: list.length,
        avg: this.round1(avg),
        high: this.round1(high),
        low: this.round1(low),
        passCount: pass,
        failCount: list.length - pass,
        passRate: list.length ? this.round1((pass / list.length) * 100) : 0
      });
    });

    return overviews.sort((a, b) => b.avg - a.avg);
  }

  // ── 4. Score Distribution Report ────────────────────────────────────────
  private computeDistribution(rows: MarkRow[]): DistributionBucket[] {
    const buckets: DistributionBucket[] = [
      { label: '0–49%',  min: 0,  max: 49,  count: 0, pct: 0, color: '#ef4444' },
      { label: '50–69%', min: 50, max: 69,  count: 0, pct: 0, color: '#f59e0b' },
      { label: '70–89%', min: 70, max: 89,  count: 0, pct: 0, color: '#3b82f6' },
      { label: '90–100%',min: 90, max: 100, count: 0, pct: 0, color: '#10b981' }
    ];
    rows.forEach((m) => {
      const p = this.pct(m);
      const b = buckets.find((x) => p >= x.min && p <= x.max);
      if (b) b.count++;
    });
    const total = rows.length || 1;
    buckets.forEach((b) => (b.pct = this.round1((b.count / total) * 100)));
    return buckets;
  }

  // ── 3. At-Risk Student Detection ────────────────────────────────────────
  private computeAtRiskStudents(rows: MarkRow[]): AtRiskStudent[] {
    const byStudent = new Map<string, MarkRow[]>();
    rows.forEach((m) => {
      if (!byStudent.has(m.studentId)) byStudent.set(m.studentId, []);
      byStudent.get(m.studentId)!.push(m);
    });

    const list: AtRiskStudent[] = [];
    byStudent.forEach((studentRows, studentId) => {
      const pcts = studentRows.map((m) => this.pct(m));
      const avg = this.mean(pcts);
      if (avg < this.filters.passMark) {
        const s = studentRows[0]?.student;
        const className =
          s?.class?.name ||
          this.classes.find((c) => c.id === s?.classId)?.name ||
          '—';
        list.push({
          studentId,
          fullName: this.studentLabel(s) || 'Unknown student',
          className,
          avgPct: this.round1(avg),
          belowCount: pcts.filter((p) => p < this.filters.passMark).length,
          totalCount: pcts.length
        });
      }
    });

    return list.sort((a, b) => a.avgPct - b.avgPct);
  }

  // ── 5. Subject & Topic Weakness Identification ──────────────────────────
  private computeWeakAssessments(rows: MarkRow[]): WeakAssessment[] {
    const byExamSubject = new Map<string, MarkRow[]>();
    rows.forEach((m) => {
      const key = `${m.examId}|${m.subjectId}`;
      if (!byExamSubject.has(key)) byExamSubject.set(key, []);
      byExamSubject.get(key)!.push(m);
    });

    const list: WeakAssessment[] = [];
    byExamSubject.forEach((items, key) => {
      const avg = this.mean(items.map((m) => this.pct(m)));
      if (avg >= this.filters.passMark) return; // only weak ones
      const sample = items[0];
      list.push({
        examId: sample.examId,
        examName: sample.exam?.name || '—',
        subjectName: sample.subject?.name || this.subjects.find((s) => s.id === sample.subjectId)?.name || '—',
        term: sample.exam?.term || '—',
        type: sample.exam?.type || '—',
        avgPct: this.round1(avg),
        count: items.length
      });
    });

    return list.sort((a, b) => a.avgPct - b.avgPct).slice(0, 30);
  }

  // ── 6. Comparative Analysis (across classes for selected subject) ───────
  private computeComparative(): ComparativeRow[] {
    if (!this.filters.subjectId) return [];

    // Re-apply all filters except classId so we get every class.
    const { classId } = this.filters;
    this.filters.classId = '';
    const slice = this.applyFilters(this.marks);
    this.filters.classId = classId;

    const byClass = new Map<string, MarkRow[]>();
    slice.forEach((m) => {
      const cls = m.exam?.classId || m.student?.classId || 'unknown';
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls)!.push(m);
    });

    const list: ComparativeRow[] = [];
    byClass.forEach((items, classKey) => {
      const pcts = items.map((m) => this.pct(m));
      const avg = this.mean(pcts);
      const pass = pcts.filter((p) => p >= this.filters.passMark).length;
      const className = this.classes.find((c) => c.id === classKey)?.name || classKey;
      list.push({
        classId: classKey,
        className,
        count: items.length,
        avgPct: this.round1(avg),
        passRate: items.length ? this.round1((pass / items.length) * 100) : 0
      });
    });

    return list.sort((a, b) => b.avgPct - a.avgPct);
  }

  // ── 2. Student Performance Analysis (trend over time) ───────────────────
  private buildStudentList(rows: MarkRow[]): Array<{ id: string; label: string; classId: string }> {
    const seen = new Map<string, { id: string; label: string; classId: string }>();
    rows.forEach((m) => {
      if (!m.studentId || seen.has(m.studentId)) return;
      seen.set(m.studentId, {
        id: m.studentId,
        label: this.studentLabel(m.student),
        classId: m.student?.classId || ''
      });
    });
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  onStudentChange(): void {
    this.recomputeStudent();
  }

  private recomputeStudent(): void {
    if (!this.selectedStudentId) {
      this.studentTrend = [];
      this.studentSummary = null;
      return;
    }
    const rows = this.filteredMarks.filter((m) => m.studentId === this.selectedStudentId);
    if (!rows.length) {
      this.studentTrend = [];
      this.studentSummary = null;
      return;
    }

    const trend = rows
      .map((m) => ({
        label: `${m.exam?.term || ''} · ${this.examTypeLabel(m.exam?.type || '')}`.trim(),
        examDate: m.exam?.examDate || '',
        subjectName: m.subject?.name || '—',
        score: m.score,
        maxScore: m.maxScore,
        pct: this.pct(m)
      }))
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());

    this.studentTrend = trend;

    const bySubject = new Map<string, number[]>();
    rows.forEach((m) => {
      const k = m.subject?.name || '—';
      if (!bySubject.has(k)) bySubject.set(k, []);
      bySubject.get(k)!.push(this.pct(m));
    });

    const subjectSummaries = Array.from(bySubject.entries()).map(([name, pcts]) => ({
      subjectName: name,
      avgPct: this.round1(this.mean(pcts)),
      count: pcts.length,
      trend: this.detectTrend(pcts)
    }));

    const overall = this.mean(trend.map((t) => t.pct));
    const direction = this.detectTrend(trend.map((t) => t.pct));

    const first = rows[0]?.student;
    this.studentSummary = {
      studentName: this.studentLabel(first),
      className:
        first?.class?.name ||
        this.classes.find((c) => c.id === first?.classId)?.name ||
        '—',
      subjects: subjectSummaries.sort((a, b) => b.avgPct - a.avgPct),
      overallAvg: this.round1(overall),
      direction
    };
  }

  /** Compare the mean of the first half to the mean of the last half. */
  private detectTrend(values: number[]): 'up' | 'down' | 'flat' {
    if (values.length < 2) return 'flat';
    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);
    const a = this.mean(firstHalf);
    const b = this.mean(secondHalf);
    if (b - a >= 2) return 'up';
    if (a - b >= 2) return 'down';
    return 'flat';
  }

  // ── Page KPIs ───────────────────────────────────────────────────────────
  private computeKPI(rows: MarkRow[], atRisk: AtRiskStudent[]) {
    const pcts = rows.map((m) => this.pct(m));
    const avg = this.mean(pcts);
    const pass = pcts.filter((p) => p >= this.filters.passMark).length;
    const students = new Set(rows.map((m) => m.studentId)).size;
    return {
      studentsAnalysed: students,
      avgPct: this.round1(avg),
      passRate: rows.length ? this.round1((pass / rows.length) * 100) : 0,
      atRiskCount: atRisk.length
    };
  }

  // ── Chart helpers (used by templates) ───────────────────────────────────
  /** Pixel coordinates for the student trend line chart. */
  trendPath(): string {
    if (this.studentTrend.length < 2) return '';
    const w = 640;
    const h = 180;
    const step = w / (this.studentTrend.length - 1);
    const pts = this.studentTrend.map((p, i) => {
      const x = i * step;
      const y = h - (Math.max(0, Math.min(100, p.pct)) / 100) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return pts.join(' ');
  }

  trendPoints(): Array<{ x: number; y: number; pct: number; label: string }> {
    const w = 640;
    const h = 180;
    const n = this.studentTrend.length;
    if (n === 0) return [];
    const step = n === 1 ? w / 2 : w / (n - 1);
    return this.studentTrend.map((p, i) => ({
      x: n === 1 ? w / 2 : i * step,
      y: h - (Math.max(0, Math.min(100, p.pct)) / 100) * h,
      pct: this.round1(p.pct),
      label: `${p.subjectName} · ${p.pct.toFixed(0)}%`
    }));
  }

  // ── Export ──────────────────────────────────────────────────────────────
  exportCSV(): void {
    const rows: string[][] = [];
    rows.push([`Marks Diagnostic Export`]);
    rows.push([`Generated`, new Date().toLocaleString()]);
    rows.push([`Pass mark threshold`, `${this.filters.passMark}%`]);
    rows.push([
      `Filters`,
      [
        this.filters.year ? `Year=${this.filters.year}` : '',
        this.filters.term ? `Term=${this.filters.term}` : '',
        this.filters.examType ? `Type=${this.examTypeLabel(this.filters.examType)}` : '',
        this.filters.classId ? `Class=${this.classes.find((c) => c.id === this.filters.classId)?.name}` : '',
        this.filters.subjectId ? `Subject=${this.subjects.find((s) => s.id === this.filters.subjectId)?.name}` : ''
      ]
        .filter(Boolean)
        .join('; ')
    ]);
    rows.push([]);

    // Section: KPIs
    rows.push(['SUMMARY']);
    rows.push(['Students analysed', String(this.kpi.studentsAnalysed)]);
    rows.push(['Average score (%)', String(this.kpi.avgPct)]);
    rows.push(['Pass rate (%)', String(this.kpi.passRate)]);
    rows.push(['At-risk students', String(this.kpi.atRiskCount)]);
    rows.push([]);

    // Section: Overview by subject
    rows.push(['PERFORMANCE BY SUBJECT']);
    rows.push(['Subject', 'Marks', 'Average %', 'Highest %', 'Lowest %', 'Pass %', 'Fail count']);
    this.subjectOverview.forEach((s) => {
      rows.push([s.subjectName, String(s.count), String(s.avg), String(s.high), String(s.low), String(s.passRate), String(s.failCount)]);
    });
    rows.push([]);

    // Section: distribution
    rows.push(['SCORE DISTRIBUTION']);
    rows.push(['Range', 'Count', 'Share %']);
    this.distribution.forEach((d) => rows.push([d.label, String(d.count), String(d.pct)]));
    rows.push([]);

    // Section: at-risk
    rows.push(['AT-RISK STUDENTS (overall avg below threshold)']);
    rows.push(['Student', 'Class', 'Average %', 'Subjects below threshold', 'Subjects assessed']);
    this.atRiskStudents.forEach((a) => {
      rows.push([a.fullName, a.className, String(a.avgPct), String(a.belowCount), String(a.totalCount)]);
    });
    rows.push([]);

    // Section: weak assessments
    rows.push(['WEAK ASSESSMENTS']);
    rows.push(['Subject', 'Term', 'Type', 'Average %', 'Marks']);
    this.weakAssessments.forEach((w) => {
      rows.push([w.subjectName, w.term, this.examTypeLabel(w.type), String(w.avgPct), String(w.count)]);
    });
    rows.push([]);

    // Section: comparative
    if (this.comparative.length) {
      rows.push(['COMPARATIVE BY CLASS']);
      rows.push(['Class', 'Marks', 'Average %', 'Pass %']);
      this.comparative.forEach((c) => rows.push([c.className, String(c.count), String(c.avgPct), String(c.passRate)]));
      rows.push([]);
    }

    // Section: student trend
    if (this.studentSummary) {
      rows.push([`STUDENT TREND — ${this.studentSummary.studentName} (${this.studentSummary.className})`]);
      rows.push(['Date', 'Term/Type', 'Subject', 'Score', 'Max', '%']);
      this.studentTrend.forEach((p) => {
        rows.push([p.examDate, p.label, p.subjectName, String(p.score), String(p.maxScore), String(this.round1(p.pct))]);
      });
    }

    const csv = rows
      .map((line) => line.map((cell) => this.csvCell(cell)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `marks-diagnostic-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportPDF(): void {
    // Triggers the browser's print dialog with our @media print styles applied,
    // letting the user save to PDF — works on every desktop browser without extra deps.
    window.print();
  }

  // ── Small helpers ───────────────────────────────────────────────────────
  private pct(m: MarkRow): number {
    const max = m.maxScore || 100;
    return max > 0 ? (m.score / max) * 100 : 0;
  }

  private mean(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private csvCell(value: string): string {
    if (value === null || value === undefined) return '';
    const v = String(value);
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }

  private studentLabel(s: any): string {
    if (!s) return '';
    const name = `${s.firstName || ''} ${s.lastName || ''}`.trim();
    const code = s.studentNumber || s.studentId || '';
    return code ? `${name} (${code})` : name || '—';
  }

  examTypeLabel(type: string): string {
    const found = this.examTypes.find((t) => t.value === type);
    return found?.label || (type || '').replace(/_/g, ' ');
  }

  trackById<T extends { id?: string }>(_: number, item: T): string {
    return item.id || '';
  }

  /** Bar width in % for the chart in the overview section. */
  barWidth(avg: number): string {
    const clamped = Math.max(0, Math.min(100, avg));
    return `${clamped}%`;
  }

  /** Header tile chip color based on direction. */
  trendBadgeClass(dir: 'up' | 'down' | 'flat'): string {
    if (dir === 'up') return 'md-chip md-chip--up';
    if (dir === 'down') return 'md-chip md-chip--down';
    return 'md-chip md-chip--flat';
  }
}
