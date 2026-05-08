import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from './Student';
import { Class } from './Class';
import { User } from './User';

@Entity('report_card_remarks')
export class ReportCardRemarks {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @ManyToOne(() => Class)
  @JoinColumn({ name: 'classId' })
  classEntity: Class;

  @Column()
  classId: string;

  @Column()
  examType: string; // 'mid_term', 'end_term', etc.

  @Column({ type: 'text', nullable: true })
  classTeacherRemarks: string | null;

  @Column({ type: 'text', nullable: true })
  headmasterRemarks: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'classTeacherId' })
  classTeacher: User | null;

  @Column({ nullable: true })
  classTeacherId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'headmasterId' })
  headmaster: User | null;

  @Column({ nullable: true })
  headmasterId: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

