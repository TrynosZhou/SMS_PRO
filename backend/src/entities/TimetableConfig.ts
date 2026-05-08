import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('timetable_configs')
export class TimetableConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', default: 8 })
  periodsPerDay: number; // Number of periods per day

  @Column({ type: 'varchar', default: '08:00' })
  schoolStartTime: string; // e.g., "08:00"

  @Column({ type: 'varchar', default: '16:00' })
  schoolEndTime: string; // e.g., "16:00"

  @Column({ type: 'int', default: 40 })
  periodDurationMinutes: number; // Duration of each period in minutes

  @Column({ type: 'json', nullable: true })
  breakPeriods: Array<{
    name: string; // e.g., "Tea Break", "Lunch", "Recess"
    startTime: string; // e.g., "10:30"
    endTime: string; // e.g., "11:00"
    durationMinutes: number;
  }> | null;

  @Column({ type: 'json', nullable: true })
  lessonsPerWeek: {
    [subjectId: string]: number; // Number of lessons per week for each subject
  } | null;

  @Column({ type: 'json', nullable: true })
  daysOfWeek: string[]; // e.g., ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

  @Column({ type: 'json', nullable: true })
  additionalPreferences: {
    [key: string]: any; // For school-specific preferences
  } | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Only one active config at a time

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

