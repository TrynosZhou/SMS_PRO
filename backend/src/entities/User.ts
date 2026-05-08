import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, Index } from 'typeorm';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { Parent } from './Parent';

export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  ACCOUNTANT = 'accountant',
  TEACHER = 'teacher',
  HOD = 'hod',
  PARENT = 'parent',
  STUDENT = 'student',
  DEMO_USER = 'demo_user',
  LIBRARIAN = 'librarian',
  INVENTORY_CLERK = 'inventory_clerk'
}

@Entity('users')
@Index(['email'], { unique: true, where: '"email" IS NOT NULL' })
@Index(['username'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  email: string | null;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.STUDENT
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  mustChangePassword: boolean;

  @Column({ default: false })
  isTemporaryAccount: boolean;

  @Column({ default: false })
  isDemo: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToOne(() => Student, student => student.user, { nullable: true })
  @JoinColumn()
  student: Student;

  @OneToOne(() => Teacher, teacher => teacher.user, { nullable: true })
  teacher: Teacher;

  @OneToOne(() => Parent, parent => parent.user, { nullable: true })
  @JoinColumn()
  parent: Parent;
}

