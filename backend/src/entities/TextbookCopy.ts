import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TextbookCatalog } from './TextbookCatalog';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { User } from './User';

@Entity('inventory_textbook_copies')
@Index(['catalogId'])
@Index(['status'])
export class TextbookCopy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TextbookCatalog, c => c.copies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'catalogId' })
  catalog: TextbookCatalog;

  @Column()
  catalogId: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  assetTag: string | null;

  @Column({ type: 'varchar', length: 32 })
  condition: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  /**
   * Chain-of-custody holders:
   * - `currentHodUserId` when a HOD is holding the copy
   * - `currentTeacherId` when a teacher is holding the copy
   * - `currentStudentId` when a student is holding the copy
   */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentHodUserId' })
  currentHodUser: User | null;

  @Column({ type: 'uuid', nullable: true })
  currentHodUserId: string | null;

  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentTeacherId' })
  currentTeacher: Teacher | null;

  @Column({ type: 'uuid', nullable: true })
  currentTeacherId: string | null;

  @ManyToOne(() => Student, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentStudentId' })
  currentStudent: Student | null;

  @Column({ type: 'uuid', nullable: true })
  currentStudentId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lostAt: Date | null;

  @ManyToOne(() => Student, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accountableStudentId' })
  accountableStudent: Student | null;

  @Column({ type: 'uuid', nullable: true })
  accountableStudentId: string | null;
}
