import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToMany, ManyToOne, JoinTable, Index } from 'typeorm';
import { User } from './User';
import { Subject } from './Subject';
import { Class } from './Class';
import { Department } from './Department';

export type TeacherRole = 'HOD' | 'Teacher';

@Entity('teachers')
@Index(['teacherId'], { unique: true })
export class Teacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  teacherId: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  qualification: string;

  @Column({ type: 'varchar', length: 16, default: 'Teacher' })
  role: TeacherRole;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  department: Department | null;

  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  /** e.g. Male / Female — used for formal title on dashboards (Mr / Mrs) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  /**
   * Stored lowercase. Female: married | single | divorced | widowed (timetable Mrs / Miss / Ms).
   * Male: married | single | divorced | widower (record-keeping; timetables still use Mr).
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  maritalStatus: string | null;

  @Column({ type: 'uuid', nullable: true })
  teachingSubjectId: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @OneToOne(() => User, user => user.teacher)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Subject, { nullable: true })
  @JoinColumn({ name: 'teachingSubjectId' })
  teachingSubject: Subject;

  @ManyToMany(() => Subject, subject => subject.teachers)
  @JoinTable()
  subjects: Subject[];

  @ManyToMany(() => Class, classEntity => classEntity.teachers)
  @JoinTable()
  classes: Class[];
}

