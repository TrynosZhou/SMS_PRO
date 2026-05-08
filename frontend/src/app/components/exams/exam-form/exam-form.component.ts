import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { navigateToExamsList } from '../exams-manage-navigation';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-exam-form',
  templateUrl: './exam-form.component.html',
  styleUrls: ['./exam-form.component.css']
})
export class ExamFormComponent implements OnInit {
  exam: any = {
    name: '',
    type: 'mid_term',
    examDate: '',
    term: '',
    description: '',
    classId: '',
    subjectIds: []
  };
  classes: any[] = [];
  subjects: any[] = [];
  availableTerms: string[] = [];
  error = '';
  success = '';
  loadingTerm = false;
  submitting = false;
  previewMode = false;
  previewData: any = null;
  examTemplates: any[] = [];
  filteredSubjects: any[] = [];
  subjectSearchQuery = '';
  dateWarning = '';
  chipsExpanded = false;
  recentExams: any[] = [];
  showRecentExams = false;

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private settingsService: SettingsService,
    public router: Router
  ) { }

  ngOnInit() {
    this.loadClasses();
    this.loadSubjects();
    this.loadActiveTerm();
    this.loadRecentExams();
    this.generateTemplates();
  }

  loadActiveTerm() {
    this.loadingTerm = true;
    
    // Generate available terms based on current year
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    this.availableTerms = [
      `Term 1 ${currentYear}`,
      `Term 2 ${currentYear}`,
      `Term 3 ${currentYear}`,
      `Term 1 ${nextYear}`,
      `Term 2 ${nextYear}`,
      `Term 3 ${nextYear}`
    ];
    
    // Load active term from settings and auto-select it
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.exam.term = data.activeTerm;
          // Add active term to available terms if not already present
          if (!this.availableTerms.includes(data.activeTerm)) {
            this.availableTerms.unshift(data.activeTerm);
          }
        } else if (data.currentTerm) {
          this.exam.term = data.currentTerm;
          // Add current term to available terms if not already present
          if (!this.availableTerms.includes(data.currentTerm)) {
            this.availableTerms.unshift(data.currentTerm);
          }
        } else {
          // If no active term is set, default to first term of current year
          this.exam.term = `Term 1 ${currentYear}`;
        }
        this.loadingTerm = false;
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
        // Default to first term of current year if error
        const currentYear = new Date().getFullYear();
        this.exam.term = `Term 1 ${currentYear}`;
        this.loadingTerm = false;
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        this.classes = this.classService.sortClasses(classesList);
      },
      error: (err: any) => console.error(err)
    });
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.subjects = data;
        this.filteredSubjects = [...this.subjects];
      },
      error: (err: any) => console.error(err)
    });
  }

  loadRecentExams() {
    this.examService.getExams().subscribe({
      next: (exams: any[]) => {
        this.recentExams = (exams || [])
          .slice(0, 5)
          .map(exam => ({
            id: exam.id,
            name: exam.name,
            type: exam.type,
            className: exam.class?.name,
            examDate: exam.examDate,
            term: exam.term
          }));
      },
      error: (err: any) => console.error('Error loading recent exams:', err)
    });
  }

  generateTemplates() {
    const currentYear = new Date().getFullYear();
    this.examTemplates = [
      {
        label: 'Mid-Term (Core Subjects)',
        value: {
          name: `Mid-Term Assessment ${currentYear}`,
          type: 'mid_term',
          description: 'Mid-term assessment focusing on core learning areas.',
          subjectSuggestion: 'core'
        }
      },
      {
        label: 'End of Term (All Subjects)',
        value: {
          name: `End of Term Examination ${currentYear}`,
          type: 'end_term',
          description: 'Comprehensive end-of-term examination across all subjects.',
          subjectSuggestion: 'all'
        }
      },
      {
        label: 'Spot Test (Single Subject)',
        value: {
          name: `Spot Test ${currentYear}`,
          type: 'mid_term',
          description: 'Short assessment focusing on a specific subject.',
          subjectSuggestion: 'single'
        }
      }
    ];
  }

  filterSubjects() {
    if (!this.subjectSearchQuery.trim()) {
      this.filteredSubjects = [...this.subjects];
      return;
    }
    const query = this.subjectSearchQuery.toLowerCase();
    this.filteredSubjects = this.subjects.filter((subject: any) =>
      subject.name?.toLowerCase().includes(query)
    );
  }

  applyTemplate(template: any) {
    if (!template?.value) {
      return;
    }
    const { value } = template;
    this.exam.name = value.name;
    this.exam.type = value.type;
    this.exam.description = value.description;

    if (value.subjectSuggestion === 'core') {
      this.exam.subjectIds = this.subjects
        .filter((subject: any) => subject.category === 'core' || subject.type === 'core')
        .map((subject: any) => subject.id);
    } else if (value.subjectSuggestion === 'all') {
      this.exam.subjectIds = this.subjects.map((subject: any) => subject.id);
    } else if (value.subjectSuggestion === 'single' && this.subjects.length > 0) {
      this.exam.subjectIds = [this.subjects[0].id];
    }
  }

  toggleChipsExpanded() {
    this.chipsExpanded = !this.chipsExpanded;
  }

  selectAllSubjects() {
    if (!this.subjects?.length) {
      this.exam.subjectIds = [];
      return;
    }
    this.exam.subjectIds = this.subjects.map((subject: any) => subject.id);
  }

  clearSelectedSubjects() {
    this.exam.subjectIds = [];
  }

  getSelectedSubjectNames(): string[] {
    return this.subjects
      .filter((subject: any) => this.exam.subjectIds.includes(subject.id))
      .map((subject: any) => subject.name);
  }

  getDaysUntilExam(): number | null {
    if (!this.exam.examDate) {
      return null;
    }
    const today = new Date();
    const examDate = new Date(this.exam.examDate);
    const diffTime = examDate.getTime() - today.setHours(0, 0, 0, 0);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  checkExamDate() {
    this.dateWarning = '';
    const daysUntilExam = this.getDaysUntilExam();
    if (daysUntilExam === null) {
      return;
    }
    if (daysUntilExam < 0) {
      this.dateWarning = '⚠️ The selected exam date is in the past.';
    } else if (daysUntilExam < 7) {
      this.dateWarning = '⚠️ The exam is scheduled within the next week. Ensure preparation timelines are realistic.';
    }
  }

  openPreview() {
    if (!this.validateForm()) {
      this.previewMode = false;
      return;
    }

    this.previewData = {
      ...this.exam,
      className: this.classes.find(cls => cls.id === this.exam.classId)?.name || 'N/A',
      subjects: this.subjects.filter((subject: any) => this.exam.subjectIds.includes(subject.id))
    };
    this.previewMode = true;
  }

  closePreview() {
    this.previewMode = false;
  }

  validateForm(): boolean {
    this.error = '';

    if (!this.exam.name || !this.exam.name.trim()) {
      this.error = 'Exam name is required';
      return false;
    }

    if (!this.exam.type) {
      this.error = 'Exam type is required';
      return false;
    }

    if (!this.exam.examDate) {
      this.error = 'Exam date is required';
      return false;
    }

    if (!this.exam.term || this.exam.term.trim() === '') {
      this.error = 'Please select a term';
      return false;
    }

    if (!this.exam.classId || this.exam.classId.trim() === '') {
      this.error = 'Please select a class';
      return false;
    }

    return true;
  }

  onSubmit() {
    if (!this.validateForm()) {
      return;
    }

    if (this.previewMode) {
      this.previewMode = false;
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    // Clean up subjectIds - remove any empty or invalid values
    let cleanSubjectIds: string[] = [];
    if (this.exam.subjectIds && Array.isArray(this.exam.subjectIds)) {
      cleanSubjectIds = this.exam.subjectIds.filter((id: any) => {
        if (!id) return false;
        const idStr = String(id).trim();
        return idStr !== '' && idStr !== 'null' && idStr !== 'undefined';
      });
    }
    
    // Prepare data to send
    const examData: any = {
      name: this.exam.name.trim(),
      type: this.exam.type,
      examDate: this.exam.examDate,
      term: this.exam.term || null,
      description: this.exam.description?.trim() || '',
      classId: this.exam.classId.trim()
    };
    
    // Only include subjectIds if there are valid ones
    if (cleanSubjectIds.length > 0) {
      examData.subjectIds = cleanSubjectIds;
    }
    
    console.log('Sending exam data:', examData);
    
    this.examService.createExam(examData).subscribe({
      next: (response: any) => {
        this.success = response.message || 'Exam created successfully';
        this.submitting = false;
        setTimeout(() => navigateToExamsList(this.router), 1500);
      },
      error: (err: any) => {
        console.error('Exam creation error:', err);
        console.error('Error response:', err.error);
        console.error('Full error object:', JSON.stringify(err, null, 2));
        
        // Extract error message from various possible locations
        let errorMessage = 'Failed to create exam';
        if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          } else if (err.error.error) {
            errorMessage = err.error.error;
          } else if (err.message) {
            errorMessage = err.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        this.submitting = false;
      }
    });
  }

  toggleSubject(subjectId: string) {
    const index = this.exam.subjectIds.indexOf(subjectId);
    if (index > -1) {
      this.exam.subjectIds.splice(index, 1);
    } else {
      this.exam.subjectIds.push(subjectId);
    }
  }

  goToExamsList(): void {
    navigateToExamsList(this.router);
  }
}

