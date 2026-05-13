import { Component, OnInit } from '@angular/core';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { PromotionRuleService } from '../../../services/promotion-rule.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

interface PromotionData {
  class: any;
  nextClass: any | null;
  students: any[];
  filteredStudents: any[];
}

@Component({
  selector: 'app-class-promotion',
  templateUrl: './class-promotion.component.html',
  styleUrls: ['./class-promotion.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0 })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0 }))
      ])
    ]),
    trigger('fadeInUp', [
      state('void', style({ opacity: 0, transform: 'translateY(20px)' })),
      transition(':enter', [
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('slideInUp', [
      state('void', style({ transform: 'translateY(50px)', opacity: 0 })),
      transition(':enter', [
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class ClassPromotionComponent implements OnInit {
  classes: any[] = [];
  students: any[] = [];
  promotionData: PromotionData[] = [];
  filteredPromotionData: PromotionData[] = [];
  
  loading = false;
  promoting = false;
  error = '';
  success = '';
  
  // Promotion mode: 'all' or 'individual'
  promotionMode: 'all' | 'individual' = 'all';
  
  // Selected students for individual mode
  selectedStudents: Set<string> = new Set();
  
  // Search and filter
  searchQuery = '';
  filterClass: string | 'all' = 'all';
  
  // Modal
  showConfirmModal = false;

  // Promotion rules from database
  promotionRules: any[] = [];
  promotionRulesMap: Map<string, any> = new Map(); // Map fromClassId -> rule

  /** Year-end eligibility from API (active term, min average on rules). */
  eligibilityOverview: {
    activeTerm: string | null;
    examType: string;
    classesMissingRules: { classId: string; className: string; studentCount: number }[];
    students: any[];
  } | null = null;
  eligibilityByStudentId: Record<string, any> = {};
  eligibilityLoading = false;
  eligibilityError = '';
  /** From API e.g. ACTIVE_TERM_REQUIRED_FOR_MIN_AVERAGE */
  eligibilityErrorCode = '';

  constructor(
    private classService: ClassService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private promotionRuleService: PromotionRuleService
  ) { }

  ngOnInit() {
    this.loadPromotionRules();
  }

  loadPromotionRules() {
    this.promotionRuleService.getActivePromotionRules().subscribe({
      next: (rules: any) => {
        this.promotionRules = Array.isArray(rules) ? rules : [];
        // Build a map for quick lookup by fromClassId
        this.promotionRulesMap.clear();
        this.promotionRules.forEach(rule => {
          if (rule.fromClassId) {
            this.promotionRulesMap.set(rule.fromClassId, rule);
          }
        });
        this.loadAllData();
      },
      error: (err: any) => {
        console.error('Error loading promotion rules:', err);
        this.promotionRules = [];
        this.promotionRulesMap.clear();
        this.loadAllData();
      }
    });
  }

  loadAllData() {
    this.loading = true;
    this.error = '';

    Promise.all([
      this.classService.getClasses().toPromise(),
      this.studentService.getStudents().toPromise()
    ]).then(([classesData, studentsData]) => {
      this.classes = Array.isArray(classesData) ? classesData : (classesData?.classes || []);
      this.students = Array.isArray(studentsData) ? studentsData : (studentsData?.students || []);

      this.buildPromotionData();
      this.filterStudents();
      this.loading = false;
      this.loadEligibilityOverview();
    }).catch((err: any) => {
      console.error('Error loading data:', err);
      this.error = err.error?.message || 'Failed to load data';
      this.loading = false;
      setTimeout(() => this.error = '', 5000);
    });
  }

  loadEligibilityOverview() {
    this.eligibilityLoading = true;
    this.eligibilityError = '';
    this.eligibilityErrorCode = '';
    this.studentService.getPromotionEligibilityOverview().subscribe({
      next: (data: any) => {
        this.eligibilityOverview = data;
        this.eligibilityByStudentId = {};
        (data.students || []).forEach((row: any) => {
          if (row.studentId) {
            this.eligibilityByStudentId[row.studentId] = row;
          }
        });
        this.eligibilityLoading = false;
        this.eligibilityErrorCode = '';
        this.pruneStaleSelections();
      },
      error: (err: any) => {
        this.eligibilityLoading = false;
        this.eligibilityOverview = null;
        this.eligibilityByStudentId = {};
        this.eligibilityErrorCode = err.error?.code || '';
        this.eligibilityError =
          err.error?.message ||
          'Could not load year-end promotion eligibility. You can still review classes; confirm the active term in Academic settings.';
      }
    });
  }

  isStudentRulePromotable(student: any, classData: PromotionData): boolean {
    if (!classData.nextClass) {
      return false;
    }
    const row = this.eligibilityByStudentId[student.id];
    if (!row) {
      return true;
    }
    return row.hasPromotionPath === true && row.eligible !== false;
  }

  isStudentBlockedByRules(student: any, classData: PromotionData): boolean {
    if (!classData.nextClass) {
      return false;
    }
    const row = this.eligibilityByStudentId[student.id];
    return !!(row && row.hasPromotionPath && row.eligible === false);
  }

  isStudentSelectable(student: any, classData: PromotionData): boolean {
    return this.isStudentRulePromotable(student, classData);
  }

  getRuleReadyStudentCount(): number {
    return this.promotionData.reduce((sum, cd) => {
      if (!cd.nextClass) {
        return sum;
      }
      return sum + cd.students.filter(s => this.isStudentRulePromotable(s, cd)).length;
    }, 0);
  }

  getRuleBlockedStudentCount(): number {
    return this.promotionData.reduce((sum, cd) => {
      if (!cd.nextClass) {
        return sum;
      }
      return sum + cd.students.filter(s => this.isStudentBlockedByRules(s, cd)).length;
    }, 0);
  }

  private pruneStaleSelections() {
    const remove: string[] = [];
    for (const id of this.selectedStudents) {
      const student = this.students.find(s => s.id === id);
      if (!student?.classId) {
        remove.push(id);
        continue;
      }
      const cd = this.promotionData.find(p => p.class.id === student.classId);
      if (!cd || !this.isStudentSelectable(student, cd)) {
        remove.push(id);
      }
    }
    remove.forEach(id => this.selectedStudents.delete(id));
  }

  studentEligibilityTitle(student: any, classData: PromotionData): string {
    if (!classData.nextClass) {
      return 'No next class configured for this grade.';
    }
    if (!this.isStudentBlockedByRules(student, classData)) {
      return '';
    }
    const row = this.eligibilityByStudentId[student.id];
    const reasons = row?.reasons && row.reasons.length ? row.reasons.join(' ') : 'Does not meet promotion rules.';
    const pct =
      row?.overallPercent != null ? ` End-of-term overall: ${row.overallPercent}%.` : '';
    const req =
      row?.minimumRequired != null ? ` Required: ≥${row.minimumRequired}%.` : '';
    return `${reasons}${pct}${req}`;
  }

  buildPromotionData() {
    this.promotionData = [];

    const studentsByClass = new Map<string, any[]>();
    this.students.forEach(student => {
      if (student.classId) {
        if (!studentsByClass.has(student.classId)) {
          studentsByClass.set(student.classId, []);
        }
        studentsByClass.get(student.classId)!.push(student);
      }
    });

    this.classes.forEach(classItem => {
      const classStudents = studentsByClass.get(classItem.id) || [];
      if (classStudents.length > 0) {
        const nextClass = this.findNextClass(classItem);
        this.promotionData.push({
          class: classItem,
          nextClass: nextClass,
          students: classStudents,
          filteredStudents: [...classStudents]
        });
      }
    });

    this.promotionData.sort((a, b) => {
      return a.class.name.localeCompare(b.class.name);
    });
  }

  findNextClass(classItem: any): any | null {
    if (!classItem || !classItem.id) {
      return null;
    }

    if (!this.promotionRulesMap || this.promotionRulesMap.size === 0) {
      return null;
    }

    const rule = this.promotionRulesMap.get(classItem.id);

    if (!rule) {
      return null;
    }

    if (rule.isFinalClass) {
      return null;
    }

    if (!rule.toClassId) {
      return null;
    }

    return this.classes.find(c => c.id === rule.toClassId) || null;
  }

  setPromotionMode(mode: 'all' | 'individual') {
    this.promotionMode = mode;
    if (mode === 'all') {
      this.selectedStudents.clear();
    }
    this.filterStudents();
  }

  filterStudents() {
    // Apply search filter
    this.promotionData.forEach(classData => {
      if (!this.searchQuery) {
        classData.filteredStudents = [...classData.students];
      } else {
        const query = this.searchQuery.toLowerCase();
        classData.filteredStudents = classData.students.filter(student =>
          student.firstName?.toLowerCase().includes(query) ||
          student.lastName?.toLowerCase().includes(query) ||
          student.studentNumber?.toLowerCase().includes(query) ||
          classData.class.name?.toLowerCase().includes(query) ||
          classData.class.form?.toLowerCase().includes(query)
        );
      }
    });
    
    // Apply class filter
    if (this.filterClass === 'all') {
      this.filteredPromotionData = [...this.promotionData];
    } else {
      this.filteredPromotionData = this.promotionData.filter(
        data => data.class.id === this.filterClass
      );
    }
  }

  setClassFilter(classId: string | 'all') {
    this.filterClass = classId;
    this.filterStudents();
  }

  clearSearch() {
    this.searchQuery = '';
    this.filterStudents();
  }

  clearFilters() {
    this.searchQuery = '';
    this.filterClass = 'all';
    this.filterStudents();
  }

  // Selection methods
  toggleStudentSelection(student: any, classData: PromotionData) {
    if (!this.isStudentSelectable(student, classData)) {
      return;
    }

    if (this.selectedStudents.has(student.id)) {
      this.selectedStudents.delete(student.id);
    } else {
      this.selectedStudents.add(student.id);
    }
  }

  isStudentSelected(student: any): boolean {
    return this.selectedStudents.has(student.id);
  }

  toggleClassSelection(classData: PromotionData) {
    if (!classData.nextClass) {
      return;
    }

    const selectable = classData.filteredStudents.filter(s => this.isStudentSelectable(s, classData));
    if (selectable.length === 0) {
      return;
    }

    const allSelected = selectable.every(s => this.selectedStudents.has(s.id));
    selectable.forEach(student => {
      if (allSelected) {
        this.selectedStudents.delete(student.id);
      } else {
        this.selectedStudents.add(student.id);
      }
    });
  }

  areAllStudentsSelected(classData: PromotionData): boolean {
    const selectable = classData.filteredStudents.filter(s => this.isStudentSelectable(s, classData));
    if (!classData.nextClass || selectable.length === 0) {
      return false;
    }
    return selectable.every(student => this.selectedStudents.has(student.id));
  }

  selectAll() {
    this.promotionData.forEach(classData => {
      if (!classData.nextClass) {
        return;
      }
      classData.students.forEach(student => {
        if (this.isStudentSelectable(student, classData)) {
          this.selectedStudents.add(student.id);
        }
      });
    });
  }

  deselectAll() {
    this.selectedStudents.clear();
  }

  selectByClass() {
    this.promotionData.forEach(classData => {
      if (!classData.nextClass) {
        return;
      }
      classData.students.forEach(student => {
        if (this.isStudentSelectable(student, classData)) {
          this.selectedStudents.add(student.id);
        }
      });
    });
  }

  getSelectedCount(): number {
    let n = 0;
    for (const id of this.selectedStudents) {
      const student = this.students.find(s => s.id === id);
      if (!student?.classId) {
        continue;
      }
      const cd = this.promotionData.find(p => p.class.id === student.classId);
      if (cd && this.isStudentSelectable(student, cd)) {
        n++;
      }
    }
    return n;
  }

  getSelectedCountForClass(classData: PromotionData): number {
    return classData.filteredStudents.filter(student =>
      this.selectedStudents.has(student.id) && this.isStudentSelectable(student, classData)
    ).length;
  }

  // Statistics
  getTotalStudents(): number {
    return this.promotionData.reduce((sum, data) => sum + data.students.length, 0);
  }

  getEligibleStudents(): number {
    return this.promotionData
      .filter(data => data.nextClass !== null)
      .reduce((sum, data) => sum + data.students.length, 0);
  }

  getPromotionCount(): number {
    if (this.promotionMode === 'all') {
      return this.getRuleReadyStudentCount();
    }
    return this.getSelectedCount();
  }

  getAffectedClassesCount(): number {
    if (this.promotionMode === 'all') {
      return this.promotionData.filter(cd =>
        cd.nextClass && cd.students.some(s => this.isStudentRulePromotable(s, cd))
      ).length;
    }
    const affectedClasses = new Set<string>();
    this.promotionData.forEach(classData => {
      if (classData.nextClass) {
        const hasSelected = classData.students.some(student =>
          this.selectedStudents.has(student.id) && this.isStudentRulePromotable(student, classData)
        );
        if (hasSelected) {
          affectedClasses.add(classData.class.id);
        }
      }
    });
    return affectedClasses.size;
  }

  canPromote(): boolean {
    if (this.promotionMode === 'all') {
      return this.getRuleReadyStudentCount() > 0;
    }
    return this.getSelectedCount() > 0;
  }

  getStudentInitials(student: any): string {
    const first = student.firstName?.charAt(0) || '';
    const last = student.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  }

  getPromotionPreview(): any[] {
    const preview: any[] = [];

    if (this.promotionMode === 'all') {
      this.promotionData.forEach(classData => {
        if (!classData.nextClass) {
          return;
        }
        const students = classData.students.filter(s => this.isStudentRulePromotable(s, classData));
        if (students.length > 0) {
          preview.push({
            class: classData.class,
            nextClass: classData.nextClass,
            students
          });
        }
      });
    } else {
      const studentsByClass = new Map<string, { class: any; nextClass: any; students: any[] }>();

      this.promotionData.forEach(classData => {
        if (!classData.nextClass) {
          return;
        }
        const selected = classData.students.filter(student =>
          this.selectedStudents.has(student.id) && this.isStudentRulePromotable(student, classData)
        );

        if (selected.length > 0) {
          if (!studentsByClass.has(classData.class.id)) {
            studentsByClass.set(classData.class.id, {
              class: classData.class,
              nextClass: classData.nextClass,
              students: []
            });
          }
          studentsByClass.get(classData.class.id)!.students.push(...selected);
        }
      });

      studentsByClass.forEach((value) => {
        preview.push(value);
      });
    }

    return preview;
  }

  openConfirmModal() {
    if (!this.canPromote()) {
      return;
    }
    this.showConfirmModal = true;
    }

  closeConfirmModal() {
    this.showConfirmModal = false;
  }
    
  promoteStudents() {
    if (!this.canPromote()) {
      return;
    }

    this.promoting = true;
    this.error = '';
    this.success = '';
    this.closeConfirmModal();

    const studentsToPromote: {
      studentId: string;
      fromClassId: string;
      toClassId: string;
      studentNumber?: string;
      fromClassName?: string;
      toClassName?: string;
    }[] = [];

    let skippedByRules = 0;

    if (this.promotionMode === 'all') {
      this.promotionData.forEach(classData => {
        if (!classData.nextClass) {
          return;
        }
        classData.students.forEach(student => {
          if (!this.isStudentRulePromotable(student, classData)) {
            skippedByRules++;
            return;
          }
          studentsToPromote.push({
            studentId: student.id,
            studentNumber: student.studentNumber,
            fromClassId: classData.class.id,
            toClassId: classData.nextClass.id,
            fromClassName: classData.class.name,
            toClassName: classData.nextClass.name
          });
        });
      });
    } else {
      this.promotionData.forEach(classData => {
        if (!classData.nextClass) {
          return;
        }
        classData.students.forEach(student => {
          if (!this.selectedStudents.has(student.id)) {
            return;
          }
          if (!this.isStudentRulePromotable(student, classData)) {
            skippedByRules++;
            return;
          }
          studentsToPromote.push({
            studentId: student.id,
            studentNumber: student.studentNumber,
            fromClassId: classData.class.id,
            toClassId: classData.nextClass.id,
            fromClassName: classData.class.name,
            toClassName: classData.nextClass.name
          });
        });
      });
    }

    if (studentsToPromote.length === 0) {
      this.promoting = false;
      this.error =
        'No students met promotion rules. Add or adjust rules under Settings → Class Promotion Rules, or fix marks / active term.';
      setTimeout(() => (this.error = ''), 7000);
      return;
    }

    const promotionPromises: Promise<boolean>[] = [];
    let successCount = 0;
    let failCount = 0;

    studentsToPromote.forEach((promo, index) => {
      const delay = index * 50;

      const promise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          this.studentService
            .updateStudent(promo.studentId, {
              classId: promo.toClassId
            })
            .toPromise()
            .then(() => {
              successCount++;
              resolve(true);
            })
            .catch((err: any) => {
              console.error('Promotion failed for student', promo.studentId, err);
              failCount++;
              resolve(false);
            });
        }, delay);
      });

      promotionPromises.push(promise);
    });

    Promise.all(promotionPromises).then(() => {
      this.promoting = false;

      if (successCount > 0) {
        this.success = `✅ Promoted <strong>${successCount}</strong> student${successCount !== 1 ? 's' : ''} to the next class.`;
        if (failCount > 0) {
          this.success += ` <strong>${failCount}</strong> update${failCount !== 1 ? 's' : ''} failed.`;
        }
        if (skippedByRules > 0) {
          this.success += ` <strong>${skippedByRules}</strong> skipped (year-end rules).`;
        }
        this.selectedStudents.clear();
        setTimeout(() => this.loadAllData(), 1500);
        setTimeout(() => (this.success = ''), 12000);
      } else {
        this.error = 'Failed to promote students. Please try again.';
        setTimeout(() => (this.error = ''), 5000);
      }
    }).catch((err: any) => {
      this.promoting = false;
      console.error('Promotion batch error', err);
      this.error = err.error?.message || 'Failed to promote students. Please check the details.';
      setTimeout(() => (this.error = ''), 5000);
    });
  }

  resetSelection() {
    this.selectedStudents.clear();
    this.searchQuery = '';
    this.filterClass = 'all';
    this.promotionMode = 'all';
    this.filterStudents();
    this.error = '';
    this.success = '';
  }
}
