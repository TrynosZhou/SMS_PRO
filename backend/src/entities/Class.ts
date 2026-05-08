import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToMany,
  ManyToOne,
  JoinTable,
  JoinColumn,
  Index,
} from 'typeorm';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { Subject } from './Subject';
import { StudentEnrollment } from './StudentEnrollment';

@Entity('classes')
@Index(['name'], { unique: true })
export class Class {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  form: string; // e.g., "Form 1", "Form 2"

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Student, 'classEntity')
  students: Student[];

  @OneToMany(() => StudentEnrollment, enrollment => enrollment.classEntity)
  enrollments: StudentEnrollment[];

  @ManyToMany(() => Teacher, teacher => teacher.classes)
  teachers: Teacher[];

  /** Optional home / class teacher (must also be in `teachers` when set). */
  @Column({ type: 'uuid', nullable: true })
  classTeacherId: string | null;

  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'classTeacherId' })
  classTeacher: Teacher | null;

  @ManyToMany(() => Subject, subject => subject.classes)
  @JoinTable()
  subjects: Subject[];

  /**
   * Weekly availability for timetable generation: rows = school days, columns = period indices (0-based).
   * Cell values: 0 = available, 1 = conditional, 2 = not available (time off).
   */
  @Column({ type: 'json', nullable: true })
  timeOffGrid: { periodCount?: number; dayCount?: number; cells: number[][] } | null;
}

