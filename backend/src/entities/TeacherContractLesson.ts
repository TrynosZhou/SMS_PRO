import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * One "lesson line" on the contact sheet: same teacher–class–subject can have multiple rows
 * (e.g. 4 single sessions + 1 double session). Each row has its own sessions/week and single/double weight.
 */
@Entity('teacher_contract_lessons')
@Index(['teacherId'])
@Index(['classId'])
@Index(['teacherId', 'classId', 'subjectId'])
export class TeacherContractLesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  teacherId: string;

  @Column({ type: 'uuid' })
  classId: string;

  @Column({ type: 'uuid' })
  subjectId: string;

  /** Weekly occurrences of this line (each counts as 1 or 2 teaching periods per isDoublePeriod). */
  @Column({ type: 'int', default: 1 })
  sessionsPerWeek: number;

  @Column({ type: 'boolean', default: false })
  isDoublePeriod: boolean;

  /**
   * Which part of the class attends this lesson.
   * Values: 'entire' | 'group1' | 'group2' | 'boys' | 'girls'
   */
  @Column({ type: 'varchar', length: 20, default: 'entire' })
  classScope: string;
}
