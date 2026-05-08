import { Component, OnInit } from '@angular/core';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-class-teachers',
  templateUrl: './class-teachers.component.html',
  styleUrls: ['./class-teachers.component.css'],
})
export class ClassTeachersComponent implements OnInit {
  classes: any[] = [];
  loading = false;
  error: string | null = null;

  constructor(private classService: ClassService) {}

  ngOnInit(): void {
    this.loadClasses();
  }

  loadClasses(): void {
    this.loading = true;
    this.error = null;
    this.classService.getClasses({ limit: 500 }).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        this.classes = this.classService.sortClasses(list);
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.message || 'Failed to load classes';
        this.loading = false;
      },
    });
  }

  teacherLabel(t: any): string {
    if (!t) {
      return '';
    }
    const fn = t.firstName ?? t.user?.firstName ?? '';
    const ln = t.lastName ?? t.user?.lastName ?? '';
    const name = `${fn} ${ln}`.trim();
    return name || '—';
  }

  teachersForClass(c: any): any[] {
    const arr = c?.teachers;
    return Array.isArray(arr) ? arr : [];
  }

}
