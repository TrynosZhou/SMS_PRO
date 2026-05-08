import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TextbookCopy } from './TextbookCopy';
import { User } from './User';
import { Teacher } from './Teacher';
import { Student } from './Student';

export type TextbookHolderType = 'store' | 'hod' | 'teacher' | 'student';

@Entity('inventory_textbook_transfers')
@Index(['copyId', 'createdAt'])
export class TextbookTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TextbookCopy, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'copyId' })
  copy: TextbookCopy;

  @Column({ type: 'uuid' })
  copyId: string;

  @Column({ type: 'varchar', length: 16 })
  fromType: TextbookHolderType;

  @Column({ type: 'uuid', nullable: true })
  fromUserId: string | null;

  @Column({ type: 'varchar', length: 16 })
  toType: TextbookHolderType;

  @Column({ type: 'uuid', nullable: true })
  toUserId: string | null;

  @ManyToOne(() => Teacher, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'toTeacherId' })
  toTeacher: Teacher | null;

  @Column({ type: 'uuid', nullable: true })
  toTeacherId: string | null;

  @ManyToOne(() => Student, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'toStudentId' })
  toStudent: Student | null;

  @Column({ type: 'uuid', nullable: true })
  toStudentId: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  conditionAtTransfer: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorizedByUserId' })
  authorizedBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  authorizedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

