import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { SettingsService } from '../../../services/settings.service';

/** Same shape as Academic Settings → Terms (`GET /settings/terms`). */
export interface RankingsTermOption {
  id: string;
  termNumber: number;
  year: number;
  status: string;
  label: string;
}

@Component({
  selector: 'app-rankings',
  templateUrl: './rankings.component.html',
  styleUrls: ['./rankings.component.css']
})
export class RankingsComponent implements OnInit {
  exams: any[] = [];
  classes: any[] = [];
  subjects: any[] = [];
  selectedExam = '';
  selectedClass = '';
  selectedSubject = '';
  selectedForm = '';
  selectedExamType = '';
  selectedTerm = '';
  rankingType = 'class';
  rankings: any[] = [];
  loading = false;
  hasSearched = false;
  loadError = '';
  availableGrades: string[] = [];
  terms: RankingsTermOption[] = [];
  loadingTerms = false;
  pdfBusy = false;
  pdfError = '';
  
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End Term' }
  ];

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private settingsService: SettingsService
  ) { }

  ngOnInit() {
    this.loadExams();
    this.loadClasses();
    this.loadSubjects();
    this.loadTerms();
  }

  /** Loads terms from Academic Settings → Terms (`/api/settings/terms`). */
  loadTerms() {
    this.loadingTerms = true;
    this.settingsService.getTerms().subscribe({
      next: (data: any) => {
        const raw: any[] = Array.isArray(data) ? data : data?.terms || data?.data || [];
        this.terms = raw
          .map((t: any) => this.mapAcademicTerm(t))
          .filter((t) => !!t.label);
        this.loadingTerms = false;
        this.selectDefaultTerm();
      },
      error: () => {
        this.terms = [];
        this.loadingTerms = false;
      }
    });
  }

  private mapAcademicTerm(t: any): RankingsTermOption {
    return {
      id: String(t?.id || ''),
      termNumber: Number(t?.termNumber ?? 0),
      year: Number(t?.year ?? 0),
      status: String(t?.status || ''),
      label: this.formatAcademicTermLabel(t),
    };
  }

  /** Matches marks-input / mark-sheets: `Term {termNumber} {year}`. */
  private formatAcademicTermLabel(t: any): string {
    const n = t?.termNumber ?? t?.term;
    const y = t?.year;
    if (n != null && n !== '' && y != null && y !== '') {
      return `Term ${n} ${y}`;
    }
    return '';
  }

  private selectDefaultTerm() {
    if (this.selectedTerm) {
      return;
    }
    const activeFromList = this.terms.find((t) => t.status === 'active');
    if (activeFromList) {
      this.selectedTerm = activeFromList.label;
      return;
    }
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        const row = Array.isArray(data) && data.length ? data[0] : data;
        const activeTerm = row?.activeTerm || row?.currentTerm || '';
        if (activeTerm && this.terms.some((t) => t.label === activeTerm)) {
          this.selectedTerm = activeTerm;
        } else if (this.terms.length > 0) {
          this.selectedTerm = this.terms[0].label;
        }
      },
      error: () => {
        if (this.terms.length > 0) {
          this.selectedTerm = this.terms[0].label;
        }
      }
    });
  }

  loadExams() {
    this.examService.getExams().subscribe({
      next: (data: any) => this.exams = data,
      error: (err: any) => console.error(err)
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        this.classes = this.classService.sortClasses(classesList);
        // Extract unique grades/forms from classes
        const gradesSet = new Set<string>();
        this.classes.forEach((cls: any) => {
          if (cls.form) {
            gradesSet.add(cls.form);
          }
        });
        this.availableGrades = Array.from(gradesSet).sort();
      },
      error: (err: any) => console.error(err)
    });
  }

  loadSubjects() {
    this.subjectService.getSubjects({ page: 1, limit: 500 }).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.subjects = list;
      },
      error: (err: any) => console.error(err)
    });
  }

  onRankingTypeChange() {
    this.rankings = [];
    this.hasSearched = false;
    this.loadError = '';
    // Reset form fields when ranking type changes
    this.selectedExam = '';
    this.selectedClass = '';
    this.selectedSubject = '';
    this.selectedForm = '';
    this.selectedExamType = '';
    // Keep selectedTerm — shared across ranking types
  }

  clearFilters() {
    this.rankings = [];
    this.hasSearched = false;
    this.loadError = '';
    this.selectedExam = '';
    this.selectedClass = '';
    this.selectedSubject = '';
    this.selectedForm = '';
    this.selectedExamType = '';
  }

  loadRankings() {
    this.loading = true;
    this.hasSearched = true;
    this.loadError = '';
    let request;

    if (this.rankingType === 'class') {
      if (!this.selectedExamType || !this.selectedClass || !this.selectedTerm) {
        this.loading = false;
        return;
      }
      request = this.examService.getClassRankingsByType(
        this.selectedExamType,
        this.selectedClass,
        this.selectedTerm
      );
    } else if (this.rankingType === 'subject') {
      if (!this.selectedExamType || !this.selectedSubject || !this.selectedForm) {
        this.loading = false;
        return;
      }
      request = this.examService.getSubjectRankingsByType(
        this.selectedExamType,
        this.selectedSubject,
        this.selectedForm
      );
    } else if (this.rankingType === 'overall-performance') {
      if (!this.selectedForm || !this.selectedExamType || !this.selectedTerm) {
        this.loading = false;
        return;
      }
      request = this.examService.getOverallPerformanceRankings(
        this.selectedForm,
        this.selectedExamType,
        this.selectedTerm
      );
    } else {
      this.loading = false;
      return;
    }

    request.subscribe({
      next: (data: any) => {
        this.rankings = data || [];
        this.loading = false;
      },
      error: (err: any) => {
        console.error(err);
        this.loading = false;
        this.rankings = [];
        this.loadError =
          err?.error?.message ||
          (typeof err?.error === 'string' ? err.error : '') ||
          (err?.status === 404
            ? 'No rankings data for these filters. Check that marks exist for this form, term, and exam type, then restart the backend if you recently updated the app.'
            : 'Could not load rankings. Please try again.');
      }
    });
  }

  getAverageScore(): number {
    if (this.rankings.length === 0) return 0;
    const scores = this.rankings.map(r => 
      this.rankingType === 'subject' ? r.percentage : r.average
    );
    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round((sum / scores.length) * 100) / 100;
  }

  getTopScore(): number {
    if (this.rankings.length === 0) return 0;
    const scores = this.rankings.map(r => 
      this.rankingType === 'subject' ? r.percentage : r.average
    );
    const max = Math.max(...scores);
    return Math.round(max * 100) / 100;
  }

  getPassRate(): number {
    if (this.rankings.length === 0) return 0;
    const passingCount = this.rankings.filter(r => {
      const score = this.rankingType === 'subject' ? r.percentage : r.average;
      return score >= 50;
    }).length;
    return Math.round((passingCount / this.rankings.length) * 100);
  }

  getPerformanceLevel(ranking: any): string {
    const score = this.rankingType === 'subject' ? ranking.percentage : ranking.average;
    if (score >= 80) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'average';
    return 'poor';
  }

  getPerformanceLabel(ranking: any): string {
    const score = this.rankingType === 'subject' ? ranking.percentage : ranking.average;
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Average';
    return 'Needs Improvement';
  }

  exportToCSV() {
    if (this.rankings.length === 0) return;

    const headers = ['Position', 'Student Name'];
    if (this.rankingType === 'overall-performance') headers.push('Class');
    if (this.rankingType === 'class' || this.rankingType === 'overall-performance') {
      headers.push('Average (%)');
    }
    if (this.rankingType === 'subject') {
      headers.push('Class', 'Score', 'Percentage (%)');
    }
    headers.push('Performance');

    const rows = this.rankings.map(r => {
      const row = [
        r.classPosition || r.subjectPosition || r.overallPosition,
        r.studentName
      ];
      if (this.rankingType === 'overall-performance') row.push(r.class || 'N/A');
      if (this.rankingType === 'class' || this.rankingType === 'overall-performance') {
        row.push(r.average.toFixed(2));
      }
      if (this.rankingType === 'subject') {
        row.push(r.class || 'N/A', `${r.score} / ${r.maxScore}`, r.percentage.toFixed(2));
      }
      row.push(this.getPerformanceLabel(r));
      return row;
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rankings_${this.rankingType}_${new Date().getTime()}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  printRankings() {
    if (this.rankings.length === 0) {
      return;
    }
    const examTypeLabel =
      this.examTypes.find((e) => e.value === this.selectedExamType)?.label ||
      this.selectedExamType ||
      'Exam';

    const filterSubtitle = this.buildRankingsPdfFilterSubtitle();

    this.pdfBusy = true;
    this.pdfError = '';
    this.examService
      .getRankingsPdf({
        rankingType: this.rankingType,
        examTypeLabel,
        filterSubtitle,
        rankings: this.rankings
      })
      .subscribe({
        next: (blob) => {
          this.pdfBusy = false;
          const url = window.URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => window.URL.revokeObjectURL(url), 120000);
        },
        error: (err: any) => {
          this.pdfBusy = false;
          const msg =
            err?.error?.message ||
            err?.message ||
            (typeof err?.error === 'string' ? err.error : null) ||
            'Could not generate PDF preview.';
          this.pdfError = msg;
          console.error(err);
        }
      });
  }

  private buildRankingsPdfFilterSubtitle(): string {
    if (this.rankingType === 'class') {
      const cls = this.classes.find((c) => c.id === this.selectedClass);
      const name = cls?.name || 'Class';
      return `Class: ${name} · Term: ${this.selectedTerm || '—'}`;
    }
    if (this.rankingType === 'subject') {
      const sub = this.subjects.find((s) => s.id === this.selectedSubject);
      const label = sub
        ? sub.code
          ? `${sub.code} — ${sub.name}`
          : sub.name
        : 'Subject';
      return `Form: ${this.selectedForm || '—'} · Subject: ${label}`;
    }
    if (this.rankingType === 'overall-performance') {
      return `Form: ${this.selectedForm || '—'} · Term: ${this.selectedTerm || '—'}`;
    }
    return '';
  }
}
