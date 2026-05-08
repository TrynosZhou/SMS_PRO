import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Teacher } from './Teacher';
import { Class } from './Class';
import { Exam } from './Exam';
import { Department } from './Department';

export type SubjectCategory = 'O_LEVEL' | 'A_LEVEL';

@Entity('subjects')
@Index(['code'], { unique: true })
@Index(['name', 'category'])
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  code: string;

  /** Short label for timetables (e.g. Eng, Math, CS). Class timetables prefer this over full name. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  shortTitle: string | null;

  @Column({ type: 'varchar', default: 'O_LEVEL' })
  category: SubjectCategory;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Department, (department) => department.subjects, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  department: Department | null;

  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToMany(() => Teacher, teacher => teacher.subjects)
  teachers: Teacher[];

  @ManyToMany(() => Class, classEntity => classEntity.subjects)
  classes: Class[];

  @ManyToMany(() => Exam, exam => exam.subjects)
  exams: Exam[];
}

