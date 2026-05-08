import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Student } from './Student';
import { Class } from './Class';
import { User } from './User';

@Entity('student_enrollments')
@Index(['studentId', 'enrollmentDate'])
@Index(['classId'])
@Index(['isActive'])
export class StudentEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, student => student.enrollments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'uuid' })
  classId: string;

  @ManyToOne(() => Class, classEntity => classEntity.enrollments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'classId' })
  classEntity: Class;

  @Column({ type: 'date' })
  enrollmentDate: Date;

  @Column({ type: 'date', nullable: true })
  withdrawalDate: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid' })
  enrolledByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'enrolledByUserId' })
  enrolledBy: User;

  @Column({ type: 'uuid', nullable: true })
  withdrawnByUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'withdrawnByUserId' })
  withdrawnBy: User | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

