import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ClassService } from '../../services/class.service';
import { ExamService } from '../../services/exam.service';

/** Exam types treated as e-learning / assigned work (not formal mid/end term exams). */
const ELEARNING_WORK_TYPES = ['assignment', 'quiz'];

@Component({
  selector: 'app-elearning',
  templateUrl: './elearning.component.html',
  styleUrls: ['./elearning.component.css']
})
export class ElearningComponent implements OnInit {
  step: 'classes' | 'work' = 'classes';
  classes: any[] = [];
  selectedClass: any = null;
  work: any[] = [];
  loading = false;
  error = '';

  constructor(
    private classService: ClassService,
    private examService: ExamService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadClasses();
  }

  loadClasses() {
    this.loading = true;
    this.error = '';
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : (data?.data || []);
        this.classes = this.classService.sortClasses(
          list.filter((c: any) => c.isActive !== false)
        );
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading classes for E-learning:', err);
        this.error = 'Could not load classes.';
        this.loading = false;
      }
    });
  }

  selectClass(cls: any) {
    if (!cls?.id) {
      return;
    }
    this.error = '';
    this.selectedClass = cls;
    this.step = 'work';
    this.loading = true;
    this.work = [];
    this.examService.getExams(cls.id).subscribe({
      next: (exams: any[]) => {
        const arr = Array.isArray(exams) ? exams : [];
        this.work = arr
          .filter((e: any) => e && ELEARNING_WORK_TYPES.includes(e.type))
          .sort((a: any, b: any) => {
            const da = new Date(a.examDate || 0).getTime();
            const db = new Date(b.examDate || 0).getTime();
            return db - da;
          });
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading exams for class:', err);
        this.error = 'Could not load assigned work for this class.';
        this.loading = false;
      }
    });
  }

  backToClasses() {
    this.step = 'classes';
    this.selectedClass = null;
    this.work = [];
    this.error = '';
  }

  getExamTypeLabel(type: string): string {
    const map: Record<string, string> = {
      assignment: 'Assignment',
      quiz: 'Quiz',
      mid_term: 'Mid Term',
      end_term: 'End of Term'
    };
    return map[type] || type || '—';
  }

  formatSubjects(exam: any): string {
    if (!exam?.subjects?.length) {
      return '—';
    }
    return exam.subjects.map((s: any) => s.name || s).join(', ');
  }

  goToExams() {
    const classId = this.selectedClass?.id;
    if (!classId) {
      return;
    }
    this.router.navigate(['/exams'], { queryParams: { classId } });
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }
}
