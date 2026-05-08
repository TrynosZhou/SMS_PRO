import { Component, OnInit } from '@angular/core';
import { TeacherService } from '../../../services/teacher.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { ActivatedRoute, Router } from '@angular/router';
import { teachersManageNav } from '../teachers-manage-navigation';

@Component({
  selector: 'app-assign-classes',
  templateUrl: './assign-classes.component.html',
  styleUrls: ['./assign-classes.component.css']
})
export class AssignClassesComponent implements OnInit {
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  selectedTeacher: any = null;
  availableClasses: any[] = [];
  teacherClasses: any[] = [];
  teacherLoad: any = null;
  selectedClassIds: string[] = [];
  teacherSearchQuery = '';
  classSearchQuery = '';
  loading = false;
  loadingLoad = false;
  error = '';
  success = '';
  submitting = false;
  linking = false;

  /** Single class + subject link (admin picks teacher, class, subject). */
  linkClassId = '';
  linkSubjectId = '';
  subjects: any[] = [];

  constructor(
    private teacherService: TeacherService,
    private classService: ClassService,
    private subjectService: SubjectService,
    public router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.loadTeachers();
    this.loadClasses();
    this.loadSubjects();

    // If opened from "Assign Class" button (teacherId query param), auto-select that teacher.
    this.route.queryParams.subscribe((params: any) => {
      const teacherId = params?.teacherId ? String(params.teacherId) : '';
      if (!teacherId) return;

      const t = this.teachers.find((x: any) => x.id === teacherId);
      if (t) {
        this.selectTeacher(t);
      } else {
        // Teachers may still be loading; selection will be attempted again in loadTeachers().
        (this as any)._autoSelectTeacherId = teacherId;
      }
    });
  }

  goToTeachersList(): void {
    this.router.navigateByUrl(teachersManageNav(this.router).list);
  }

  loadSubjects(): void {
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        this.subjects = [...list].sort((a: any, b: any) =>
          (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.subjects = [];
      },
    });
  }

  loadTeachers() {
    this.loading = true;
    this.error = '';
    this.teacherService.getTeachers().subscribe({
      next: (data: any) => {
        const raw = Array.isArray(data) ? data : data?.data || [];
        this.teachers = raw.filter((t: any) => t.isActive !== false);
        this.filteredTeachers = [...this.teachers];
        this.loading = false;

        const autoId = (this as any)._autoSelectTeacherId;
        if (autoId) {
          const t = this.teachers.find((x: any) => x.id === autoId);
          if (t) {
            this.selectTeacher(t);
            (this as any)._autoSelectTeacherId = '';
          }
        }
      },
      error: (err: any) => {
        this.error = 'Failed to load teachers';
        this.loading = false;
        console.error('Error loading teachers:', err);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        const classesList = Array.isArray(data) ? data : (data?.data || []);
        const activeClasses = classesList.filter((c: any) => c.isActive !== false);
        this.availableClasses = this.classService.sortClasses(activeClasses);
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  filterTeachers() {
    if (!this.teacherSearchQuery.trim()) {
      this.filteredTeachers = [...this.teachers];
      return;
    }
    const query = this.teacherSearchQuery.toLowerCase();
    this.filteredTeachers = this.teachers.filter(teacher =>
      teacher.firstName?.toLowerCase().includes(query) ||
      teacher.lastName?.toLowerCase().includes(query) ||
      teacher.teacherId?.toLowerCase().includes(query)
    );
  }

  selectTeacher(teacher: any) {
    this.selectedTeacher = teacher;
    this.selectedClassIds = [];
    this.teacherClasses = [];
    this.teacherLoad = null;
    this.linkClassId = '';
    this.linkSubjectId = '';
    this.error = '';
    this.success = '';
    this.loadTeacherClasses();
    this.loadTeacherLoad();
  }

  loadTeacherClasses() {
    if (!this.selectedTeacher?.id) return;
    
    this.loading = true;
    this.error = '';
    this.teacherService.getTeacherClasses(this.selectedTeacher.id).subscribe({
      next: (response: any) => {
        const classesList = response.classes || [];
        this.teacherClasses = this.classService.sortClasses(classesList);
        this.selectedClassIds = this.teacherClasses.map((c: any) => c.id);
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading teacher classes:', err);
        // If it's a 500 error, the backend might be having issues, but we can still proceed
        // with an empty list - the user can still assign classes
        this.teacherClasses = [];
        this.selectedClassIds = [];
        this.loading = false;
        // Only show error if it's not a server error (might be temporary)
        if (err.status !== 500) {
          this.error = 'Failed to load teacher classes. You can still assign classes.';
          setTimeout(() => this.error = '', 5000);
        }
      }
    });
  }

  loadTeacherLoad() {
    if (!this.selectedTeacher?.id) return;
    
    this.loadingLoad = true;
    this.teacherService.getTeacherLoad(this.selectedTeacher.id).subscribe({
      next: (data: any) => {
        this.teacherLoad = data;
        this.loadingLoad = false;
      },
      error: (err: any) => {
        console.error('Error loading teacher load:', err);
        this.loadingLoad = false;
      }
    });
  }

  toggleClass(classId: string) {
    const index = this.selectedClassIds.indexOf(classId);
    if (index > -1) {
      this.selectedClassIds.splice(index, 1);
    } else {
      this.selectedClassIds.push(classId);
    }
  }

  isClassSelected(classId: string): boolean {
    return this.selectedClassIds.includes(classId);
  }

  filterClasses() {
    // Filtering is handled in the template
  }

  getFilteredClasses(): any[] {
    if (!this.classSearchQuery.trim()) {
      return this.availableClasses;
    }
    const query = this.classSearchQuery.toLowerCase();
    return this.availableClasses.filter(cls =>
      cls.name?.toLowerCase().includes(query) ||
      cls.form?.toLowerCase().includes(query)
    );
  }

  getStudentCountForClass(classId: string): number {
    if (!this.teacherLoad?.load?.classes) return 0;
    const classLoad = this.teacherLoad.load.classes.find((c: any) => c.id === classId);
    return classLoad?.studentCount || 0;
  }

  clearSelection() {
    this.selectedTeacher = null;
    this.selectedClassIds = [];
    this.teacherClasses = [];
    this.teacherLoad = null;
    this.linkClassId = '';
    this.linkSubjectId = '';
    this.teacherSearchQuery = '';
    this.classSearchQuery = '';
    this.error = '';
    this.success = '';
  }

  applyClassSubjectLink(): void {
    if (!this.selectedTeacher?.id) {
      this.error = 'Please select a teacher first';
      return;
    }
    if (!this.linkClassId) {
      this.error = 'Please choose a class';
      return;
    }
    if (!this.linkSubjectId) {
      this.error = 'Please choose a subject';
      return;
    }

    this.linking = true;
    this.error = '';
    this.success = '';

    this.teacherService
      .assignTeacherClassSubject(this.selectedTeacher.id, this.linkClassId, this.linkSubjectId)
      .subscribe({
        next: (res: any) => {
          this.linking = false;
          this.success = res?.message || 'Assignment saved';
          this.loadTeacherClasses();
          this.loadTeacherLoad();
          if (res?.teacher) {
            const t = res.teacher;
            const inList = this.teachers.find((x: any) => x.id === t.id);
            if (inList) {
              Object.assign(inList, {
                subjects: t.subjects,
                classes: t.classes,
              });
            }
          }
          setTimeout(() => (this.success = ''), 6000);
        },
        error: (err: any) => {
          this.linking = false;
          this.error = err?.error?.message || err?.message || 'Failed to save assignment';
          setTimeout(() => (this.error = ''), 7000);
        },
      });
  }

  saveAssignment() {
    if (!this.selectedTeacher) {
      this.error = 'Please select a teacher first';
      return;
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    this.teacherService.assignClassesToTeacher(this.selectedTeacher.id, this.selectedClassIds).subscribe({
      next: (response: any) => {
        this.success = 'Classes assigned successfully';
        this.submitting = false;
        // Reload teacher classes and load
        this.loadTeacherClasses();
        this.loadTeacherLoad();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to assign classes';
        this.submitting = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}

