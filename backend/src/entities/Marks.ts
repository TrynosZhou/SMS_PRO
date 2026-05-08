import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from './Student';
import { Exam } from './Exam';
import { Subject } from './Subject';

@Entity('marks')
export class Marks {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, student => student.marks)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @ManyToOne(() => Exam, exam => exam.marks)
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column()
  examId: string;

  @ManyToOne(() => Subject)
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column()
  subjectId: string;

  @Column('decimal', { precision: 5, scale: 2 })
  score: number;

  @Column('decimal', { precision: 5, scale: 2 })
  maxScore: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  uniformMark: number | null; // Moderated uniform mark percentage

  @Column({ nullable: true, type: 'text' })
  comments: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

