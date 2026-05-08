import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { Class } from './Class';
import { Subject } from './Subject';

@Entity('record_books')
@Index(['studentId', 'teacherId', 'classId', 'subjectId', 'term', 'year'], { unique: true })
export class RecordBook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  studentId: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  teacherId: string;

  @ManyToOne(() => Teacher)
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @Column()
  classId: string;

  @ManyToOne(() => Class)
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column()
  subjectId: string;

  @ManyToOne(() => Subject)
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column({ type: 'varchar', length: 50 })
  term: string; // e.g., "Term 1"

  @Column({ type: 'varchar', length: 10 })
  year: string; // e.g., "2025"

  // Test marks (up to 10 tests)
  @Column({ type: 'integer', nullable: true })
  test1: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test1Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test1Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test2: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test2Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test2Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test3: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test3Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test3Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test4: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test4Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test4Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test5: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test5Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test5Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test6: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test6Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test6Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test7: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test7Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test7Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test8: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test8Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test8Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test9: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test9Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test9Date: Date | null;

  @Column({ type: 'integer', nullable: true })
  test10: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  test10Topic: string | null;

  @Column({ type: 'date', nullable: true })
  test10Date: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

