import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Teacher } from './Teacher';
import { Class } from './Class';
import { Subject } from './Subject';
import { TimetableVersion } from './TimetableVersion';

@Entity('timetable_slots')
@Index(['versionId', 'dayOfWeek', 'periodNumber'])
/** Non-unique: administrators may allow duplicate teacher or class in the same period (ignore collisions). */
@Index(['versionId', 'teacherId', 'dayOfWeek', 'periodNumber'])
@Index(['versionId', 'classId', 'dayOfWeek', 'periodNumber'])
export class TimetableSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  versionId: string; // Reference to TimetableVersion

  @Column({ type: 'uuid' })
  teacherId: string;

  @Column({ type: 'uuid' })
  classId: string;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'varchar' })
  dayOfWeek: string; // e.g., "Monday", "Tuesday"

  @Column({ type: 'int' })
  periodNumber: number; // Period number (1, 2, 3, etc.)

  @Column({ type: 'varchar', nullable: true })
  startTime: string; // e.g., "08:00"

  @Column({ type: 'varchar', nullable: true })
  endTime: string; // e.g., "08:40"

  @Column({ type: 'varchar', nullable: true })
  room: string; // Optional room number/name

  @Column({ type: 'boolean', default: false })
  isBreak: boolean; // True if this is a break period

  @Column({ type: 'boolean', default: false })
  isManuallyEdited: boolean; // True if manually edited after generation

  /** When true, the slot cannot be moved until an administrator unlocks it. */
  @Column({ type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ type: 'timestamp', nullable: true })
  editedAt: Date | null; // When this slot was manually edited

  @Column({ type: 'uuid', nullable: true })
  editedBy: string | null; // User ID who edited this slot

  @ManyToOne(() => TimetableVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'versionId' })
  version: TimetableVersion;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  class: Class;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;
}

