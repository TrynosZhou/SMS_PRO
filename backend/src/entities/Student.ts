import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToOne, OneToMany, Index } from 'typeorm';
import { User } from './User';
import { Class } from './Class';
import { Parent } from './Parent';
import { Marks } from './Marks';
import { Invoice } from './Invoice';
import { StudentEnrollment } from './StudentEnrollment';

export type EnrollmentStatus = 'Not Enrolled' | 'Enrolled' | 'Transferred Out';

@Entity('students')
@Index(['studentNumber'], { unique: true })
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  /** National / ID number (e.g. national ID format). Optional. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  nationalId: string | null;

  @Column()
  studentNumber: string;

  @Column({ type: 'date' })
  dateOfBirth: Date;

  @Column()
  gender: string;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  contactNumber: string;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfJoining: Date | null;

  @Column({ type: 'varchar', nullable: true })
  previousSchool: string | null;

  @Column({ type: 'varchar', length: 20, default: 'Day Scholar' })
  studentType: string; // 'Boarder' or 'Day Scholar'

  @Column({ type: 'boolean', default: false })
  usesTransport: boolean; // Day scholar using school transport

  @Column({ type: 'boolean', default: false })
  usesDiningHall: boolean; // Day scholar using dining hall (DH) meals

  @Column({ type: 'boolean', default: false })
  isStaffChild: boolean; // Staff children don't pay tuition, pay 50% DH fees, don't pay transport

  @Column({ type: 'varchar', nullable: true })
  photo: string | null; // Path to student's passport photo

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: ['Not Enrolled', 'Enrolled', 'Transferred Out'], default: 'Not Enrolled' })
  enrollmentStatus: EnrollmentStatus;

  @ManyToOne(() => Class, classEntity => classEntity.students, { nullable: true })
  @JoinColumn({ name: 'classId' })
  classEntity: Class | null;

  @Column({ nullable: true })
  classId: string | null;

  @OneToMany(() => StudentEnrollment, enrollment => enrollment.student)
  enrollments: StudentEnrollment[];

  @OneToOne(() => User, user => user.student)
  user: User;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => Parent, parent => parent.students, { nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent: Parent;

  @Column({ nullable: true })
  parentId: string | null;

  @OneToMany(() => Marks, marks => marks.student)
  marks: Marks[];

  @OneToMany(() => Invoice, invoice => invoice.student)
  invoices: Invoice[];
}

