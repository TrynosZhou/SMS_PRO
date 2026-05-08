import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { navigateToExamsList } from '../exams-manage-navigation';
import { StudentService } from '../../../services/student.service';
import { SubjectService } from '../../../services/subject.service';

@Component({
  selector: 'app-marks-entry',
  templateUrl: './marks-entry.component.html',
  styleUrls: ['./marks-entry.component.css']
})
export class MarksEntryComponent implements OnInit {
  examId: string = '';
  exam: any = null;
  students: any[] = [];
  subjects: any[] = [];
  marks: any = {};
  loading = false;
  error = '';
  success = '';

  constructor(
    private examService: ExamService,
    private studentService: StudentService,
    private subjectService: SubjectService,
    private route: ActivatedRoute,
    public router: Router
  ) { }

  ngOnInit() {
    this.examId = this.route.snapshot.params['id'];
    this.loadExam();
  }

  goToExamsList(): void {
    navigateToExamsList(this.router);
  }

  loadExam() {
    this.loading = true;
    this.examService.getExamById(this.examId).subscribe({
      next: (exam: any) => {
        this.exam = exam;
        if (this.exam) {
          // Use subjects from the exam, not all subjects
          this.subjects = this.exam.subjects || [];
          // Load students from the exam's class - use classId or class.id
          const classId = this.exam.classId || this.exam.class?.id;
          console.log('Exam loaded:', {
              classId: this.exam.classId,
              class: this.exam.class,
              classIdFromClass: this.exam.class?.id,
              finalClassId: classId
          });
          this.loadStudents(classId);
          this.loadExistingMarks();
        }
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading exam:', err);
        this.error = 'Failed to load exam details';
        this.loading = false;
      }
    });
  }

  loadStudents(classId: string) {
    if (!classId) {
      this.error = 'Exam class not found';
      return;
    }
    
    console.log('Loading students for classId:', classId);
    console.log('Exam class:', this.exam?.class);
    
    this.studentService.getStudents({ classId }).subscribe({
      next: (data: any) => {
        console.log('Received students data:', data);
        console.log('Number of students received:', data?.length || 0);
        
        // Students are already filtered by classId and isActive in the backend
        // Sort students alphabetically for sequential entry
        this.students = (data || []).sort((a: any, b: any) => {
          const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
          const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        if (this.students.length === 0) {
          console.warn('No students found for classId:', classId);
          console.warn('Exam class name:', this.exam?.class?.name);
          console.warn('Exam classId:', this.exam?.classId);
        } else {
          console.log('Students loaded successfully:', this.students.length);
          // Log first student's class info for debugging
          if (this.students[0]) {
            console.log('First student classId:', this.students[0].classId);
            console.log('First student class name:', this.students[0].class?.name);
          }
        }
        
        this.initializeMarks();
      },
      error: (err: any) => {
        console.error('Error loading students:', err);
        console.error('Error details:', err.error);
        this.error = err.error?.message || 'Failed to load students. Please check if students are enrolled in this class.';
      }
    });
  }

  loadExistingMarks() {
    this.examService.getMarks(this.examId).subscribe({
      next: (data: any) => {
        data.forEach((mark: any) => {
          const key = `${mark.studentId}_${mark.subjectId}`;
          this.marks[key] = {
            score: mark.score,
            maxScore: mark.maxScore,
            comments: mark.comments
          };
        });
      },
      error: (err: any) => console.error(err)
    });
  }

  initializeMarks() {
    this.students.forEach(student => {
      this.subjects.forEach(subject => {
        const key = `${student.id}_${subject.id}`;
        if (!this.marks[key]) {
          this.marks[key] = { score: null, maxScore: 100, comments: '' };
        }
      });
    });
  }

  onSubmit() {
    this.loading = true;
    this.error = '';
    this.success = '';

    // Validate that we have students and subjects
    if (this.students.length === 0) {
      this.error = 'No students found in this class';
      this.loading = false;
      return;
    }

    if (this.subjects.length === 0) {
      this.error = 'No subjects assigned to this exam';
      this.loading = false;
      return;
    }

    const marksData: any[] = [];
    this.students.forEach(student => {
      this.subjects.forEach(subject => {
        const key = `${student.id}_${subject.id}`;
        const mark = this.marks[key];
        // Include marks even if score is 0, but require a valid number
        if (mark && (mark.score !== null && mark.score !== undefined && mark.score !== '')) {
          marksData.push({
            studentId: student.id,
            subjectId: subject.id,
            score: parseFloat(mark.score) || 0,
            maxScore: parseFloat(mark.maxScore) || 100,
            comments: mark.comments || ''
          });
        }
      });
    });

    if (marksData.length === 0) {
      this.error = 'Please enter at least one mark before saving';
      this.loading = false;
      return;
    }

    this.examService.captureMarks(this.examId, marksData).subscribe({
      next: () => {
        this.success = 'Marks saved successfully! Report cards can now be generated for all students.';
        this.loading = false;
        // Reload existing marks to show updated data
        this.loadExistingMarks();
      },
      error: (err: any) => {
        console.error('Error saving marks:', err);
        if (err.status === 403) {
          this.error = 'You do not have permission to save marks. Please contact an administrator.';
        } else if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || err.error?.error || 'Failed to save marks. Please try again.';
        }
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  getMarkKey(studentId: string, subjectId: string): string {
    return `${studentId}_${subjectId}`;
  }
}

