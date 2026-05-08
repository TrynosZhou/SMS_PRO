import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { Teacher } from './Teacher';
import { Class } from './Class';

@Entity('teacher_classes')
@Unique(['teacherId', 'classId'])
@Index(['teacherId'])
@Index(['classId'])
export class TeacherClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  teacherId: string;

  @Column({ type: 'uuid' })
  classId: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  class: Class;
}

