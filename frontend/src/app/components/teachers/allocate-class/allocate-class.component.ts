import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
import { teachersManageNav } from '../teachers-manage-navigation';

@Component({
  selector: 'app-allocate-class',
  templateUrl: './allocate-class.component.html',
  styleUrls: ['./allocate-class.component.css']
})
export class AllocateClassComponent implements OnInit {
  teacherId = '';
  teacher: any = null;

  availableClasses: any[] = [];
  teacherClasses: any[] = [];
  teacherLoad: any = null;
  selectedClassIds: string[] = [];

  classSearchQuery = '';
  loading = false;
  submitting = false;
  error = '';
  success = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private teacherService: TeacherService,
    private classService: ClassService
  ) {}

  ngOnInit(): void {
    if (!this.canAccess()) {
      this.error = 'Access denied. Administrator access required.';
      return;
    }

    this.route.queryParams.subscribe((params: any) => {
      this.teacherId = params?.teacherId ? String(params.teacherId) : '';
      if (!this.teacherId) {
        this.error = 'Teacher not specified.';
        return;
      }
      this.loadTeacher();
      this.loadClasses();
      this.loadTeacherClasses();
      this.loadTeacherLoad();
    });
  }

  private canAccess(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  goBack(): void {
    this.router.navigateByUrl(teachersManageNav(this.router).list);
  }

  loadTeacher(): void {
    this.loading = true;
    this.teacherService.getTeacherById(this.teacherId).subscribe({
      next: (t: any) => {
        this.teacher = t?.teacher || t;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading teacher:', err);
        this.loading = false;
        this.error = 'Failed to load teacher details';
      }
    });
  }

  loadClasses(): void {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : (data?.data || []);
        const active = list.filter((c: any) => c.isActive !== false);
        this.availableClasses = this.classService.sortClasses(active);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.availableClasses = [];
      }
    });
  }

  loadTeacherClasses(): void {
    this.teacherService.getTeacherClasses(this.teacherId).subscribe({
      next: (response: any) => {
        const classesList = response?.classes || [];
        this.teacherClasses = this.classService.sortClasses(classesList);
        this.selectedClassIds = this.teacherClasses.map((c: any) => c.id);
      },
      error: (err: any) => {
        console.error('Error loading teacher classes:', err);
        this.teacherClasses = [];
        this.selectedClassIds = [];
      }
    });
  }

  loadTeacherLoad(): void {
    this.teacherService.getTeacherLoad(this.teacherId).subscribe({
      next: (data: any) => {
        this.teacherLoad = data;
      },
      error: (err: any) => {
        console.error('Error loading teacher load:', err);
        this.teacherLoad = null;
      }
    });
  }

  getFilteredClasses(): any[] {
    if (!this.classSearchQuery.trim()) return this.availableClasses;
    const q = this.classSearchQuery.toLowerCase();
    return this.availableClasses.filter((cls: any) =>
      cls.name?.toLowerCase().includes(q) || cls.form?.toLowerCase().includes(q)
    );
  }

  toggleClass(classId: string): void {
    const idx = this.selectedClassIds.indexOf(classId);
    if (idx >= 0) {
      this.selectedClassIds.splice(idx, 1);
    } else {
      this.selectedClassIds.push(classId);
    }
  }

  isClassSelected(classId: string): boolean {
    return this.selectedClassIds.includes(classId);
  }

  getStudentCountForClass(classId: string): number {
    if (!this.teacherLoad?.load?.classes) return 0;
    const classLoad = this.teacherLoad.load.classes.find((c: any) => c.id === classId);
    return classLoad?.studentCount || 0;
  }

  /** Rows for "currently assigned" — prefer API load (includes subjects per class). */
  get assignedClassesRows(): any[] {
    const fromLoad = this.teacherLoad?.load?.classes;
    if (fromLoad?.length) {
      return fromLoad;
    }
    return this.teacherClasses.map((c: any) => {
      const full = this.availableClasses.find((x: any) => x.id === c.id) || c;
      return {
        ...c,
        studentCount: this.getStudentCountForClass(c.id),
        subjects: this.subjectsOverlapForClass(full),
      };
    });
  }

  /** Subjects the teacher teaches that also exist on the class timetable. */
  subjectsOverlapForClass(classObj: any): any[] {
    const ts = this.teacher?.subjects;
    const cs = classObj?.subjects;
    if (!ts?.length || !cs?.length) {
      return [];
    }
    const cids = new Set(cs.map((s: any) => s.id));
    return ts
      .filter((s: any) => cids.has(s.id))
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        shortTitle: s.shortTitle,
      }));
  }

  /** One-line hint for the allocation checkbox list. */
  formatSubjectsForAllocation(cls: any): string {
    const list = this.subjectsOverlapForClass(
      this.availableClasses.find((x: any) => x.id === cls.id) || cls
    );
    if (!list.length) {
      return '';
    }
    return (
      'Teaches here: ' +
      list
        .map((s: any) => (s.shortTitle || s.code || s.name || '').trim())
        .filter(Boolean)
        .join(', ')
    );
  }

  subjectChipLabel(s: any): string {
    const t = (s?.shortTitle || s?.code || s?.name || '').trim();
    return t || 'Subject';
  }

  saveAssignment(): void {
    if (!this.teacherId) return;
    this.submitting = true;
    this.error = '';
    this.success = '';

    this.teacherService.assignClassesToTeacher(this.teacherId, this.selectedClassIds).subscribe({
      next: () => {
        this.submitting = false;
        this.success = 'Classes assigned successfully';
        this.loadTeacherClasses();
        this.loadTeacherLoad();
        setTimeout(() => (this.success = ''), 5000);
      },
      error: (err: any) => {
        this.submitting = false;
        this.error = err?.error?.message || err?.message || 'Failed to assign classes';
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }
}

