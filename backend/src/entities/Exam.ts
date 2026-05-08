import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { Class } from './Class';
import { Subject } from './Subject';
import { Marks } from './Marks';

export enum ExamType {
  MID_TERM = 'mid_term',
  END_TERM = 'end_term',
  ASSIGNMENT = 'assignment',
  QUIZ = 'quiz'
}

export enum ExamStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published'
}

@Entity('exams')
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: ExamType
  })
  type: ExamType;

  @Column({ type: 'date' })
  examDate: Date;

  @Column({ type: 'varchar', nullable: true })
  term: string | null; // e.g., "Term 1", "Term 2", "Term 3"

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @ManyToOne(() => Class, classEntity => classEntity.id)
  @JoinColumn({ name: 'classId' })
  classEntity: Class;

  @Column()
  classId: string;

  @ManyToMany(() => Subject, subject => subject.exams)
  @JoinTable()
  subjects: Subject[];

  @OneToMany(() => Marks, marks => marks.exam)
  marks: Marks[];

  @Column({
    type: 'enum',
    enum: ExamStatus,
    default: ExamStatus.DRAFT
  })
  status: ExamStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

