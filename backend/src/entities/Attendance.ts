import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from './Student';
import { Class } from './Class';
import { User } from './User';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  EXCUSED = 'excused'
}

@Entity('attendance')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  classEntity: Class;

  @Column()
  classId: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({
    type: 'enum',
    enum: AttendanceStatus,
    default: AttendanceStatus.PRESENT
  })
  status: AttendanceStatus;

  @Column({ type: 'varchar', nullable: true })
  term: string | null; // e.g., "Term 1 2024"

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'markedBy' })
  markedByUser: User | null;

  @Column({ nullable: true })
  markedBy: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

