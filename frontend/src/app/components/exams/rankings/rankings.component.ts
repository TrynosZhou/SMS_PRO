import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';

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
  rankingType = 'class';
  rankings: any[] = [];
  loading = false;
  hasSearched = false;
  availableGrades: string[] = [];
  pdfBusy = false;
  pdfError = '';
  
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End Term' }
  ];

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService
  ) { }

  ngOnInit() {
    this.loadExams();
    this.loadClasses();
    this.loadSubjects();
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
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => this.subjects = data,
      error: (err: any) => console.error(err)
    });
  }

  onRankingTypeChange() {
    this.rankings = [];
    this.hasSearched = false;
    // Reset form fields when ranking type changes
    this.selectedExam = '';
    this.selectedClass = '';
    this.selectedSubject = '';
    this.selectedForm = '';
    this.selectedExamType = '';
  }

  clearFilters() {
    this.rankings = [];
    this.hasSearched = false;
    this.selectedExam = '';
    this.selectedClass = '';
    this.selectedSubject = '';
    this.selectedForm = '';
    this.selectedExamType = '';
  }

  loadRankings() {
    this.loading = true;
    this.hasSearched = true;
    let request;

    if (this.rankingType === 'class') {
      if (!this.selectedExamType || !this.selectedClass) {
        this.loading = false;
        return;
      }
      // For class rankings, we need to get exams by type and class, then aggregate
      request = this.examService.getClassRankingsByType(this.selectedExamType, this.selectedClass);
    } else if (this.rankingType === 'subject') {
      if (!this.selectedExamType || !this.selectedSubject) {
        this.loading = false;
        return;
      }
      // For subject rankings, we need to get exams by type and subject, then aggregate
      request = this.examService.getSubjectRankingsByType(this.selectedExamType, this.selectedSubject);
    } else if (this.rankingType === 'overall-performance') {
      if (!this.selectedForm || !this.selectedExamType) {
        this.loading = false;
        return;
      }
      request = this.examService.getOverallPerformanceRankings(this.selectedForm, this.selectedExamType);
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
      headers.push('Score', 'Percentage (%)');
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
        row.push(`${r.score} / ${r.maxScore}`, r.percentage.toFixed(2));
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
      return `Class: ${name}`;
    }
    if (this.rankingType === 'subject') {
      const sub = this.subjects.find((s) => s.id === this.selectedSubject);
      const label = sub
        ? sub.code
          ? `${sub.code} — ${sub.name}`
          : sub.name
        : 'Subject';
      return `Subject: ${label}`;
    }
    if (this.rankingType === 'overall-performance') {
      return `Form: ${this.selectedForm || '—'}`;
    }
    return '';
  }
}
