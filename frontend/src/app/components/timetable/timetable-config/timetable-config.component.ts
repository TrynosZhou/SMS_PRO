import { Component, OnInit } from '@angular/core';
import { TimetableService, TimetableConfig } from '../../../services/timetable.service';
import { SubjectService } from '../../../services/subject.service';

@Component({
  selector: 'app-timetable-config',
  templateUrl: './timetable-config.component.html',
  styleUrls: ['./timetable-config.component.css']
})
export class TimetableConfigComponent implements OnInit {
  config: TimetableConfig = {
    periodsPerDay: 8,
    schoolStartTime: '08:00',
    schoolEndTime: '16:00',
    periodDurationMinutes: 40,
    breakPeriods: [
      { name: 'Tea Break', startTime: '10:30', endTime: '11:00', durationMinutes: 30 },
      { name: 'Lunch', startTime: '13:00', endTime: '14:00', durationMinutes: 60 }
    ],
    daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    lessonsPerWeek: {}
  };

  subjects: any[] = [];
  daysOfWeekOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  constructor(
    private timetableService: TimetableService,
    private subjectService: SubjectService
  ) {}

  ngOnInit(): void {
    this.loadConfig();
    this.loadSubjects();
  }

  loadConfig(): void {
    this.loading = true;
    this.error = null;
    this.timetableService.getConfig().subscribe({
      next: (config) => {
        this.config = { ...this.config, ...config };
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading config:', err);
        this.error = 'Failed to load timetable configuration';
        this.loading = false;
      }
    });
  }

  loadSubjects(): void {
    this.subjectService.getSubjects().subscribe({
      next: (subjects) => {
        this.subjects = subjects;
        // Initialize lessonsPerWeek for subjects that don't have it
        subjects.forEach((subject: any) => {
          if (!this.config.lessonsPerWeek || !this.config.lessonsPerWeek[subject.id]) {
            if (!this.config.lessonsPerWeek) {
              this.config.lessonsPerWeek = {};
            }
            this.config.lessonsPerWeek[subject.id] = 3; // Default 3 lessons per week
          }
        });
      },
      error: (err) => {
        console.error('Error loading subjects:', err);
      }
    });
  }

  addBreakPeriod(): void {
    if (!this.config.breakPeriods) {
      this.config.breakPeriods = [];
    }
    this.config.breakPeriods.push({
      name: '',
      startTime: '10:00',
      endTime: '10:30',
      durationMinutes: 30
    });
  }

  removeBreakPeriod(index: number): void {
    if (this.config.breakPeriods) {
      this.config.breakPeriods.splice(index, 1);
    }
  }

  calculateBreakDuration(index: number): void {
    if (!this.config.breakPeriods) return;
    const breakPeriod = this.config.breakPeriods[index];
    if (breakPeriod.startTime && breakPeriod.endTime) {
      const start = this.timeToMinutes(breakPeriod.startTime);
      const end = this.timeToMinutes(breakPeriod.endTime);
      breakPeriod.durationMinutes = end - start;
    }
  }

  timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  toggleDay(day: string): void {
    const index = this.config.daysOfWeek.indexOf(day);
    if (index > -1) {
      this.config.daysOfWeek.splice(index, 1);
    } else {
      this.config.daysOfWeek.push(day);
    }
  }

  saveConfig(): void {
    this.saving = true;
    this.error = null;
    this.success = null;

    this.timetableService.saveConfig(this.config).subscribe({
      next: (response) => {
        this.success = 'Timetable configuration saved successfully';
        this.saving = false;
        setTimeout(() => {
          this.success = null;
        }, 3000);
      },
      error: (err) => {
        console.error('Error saving config:', err);
        this.error = err.error?.message || 'Failed to save timetable configuration';
        this.saving = false;
      }
    });
  }
}

