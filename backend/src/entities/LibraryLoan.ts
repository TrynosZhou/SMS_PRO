import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Student } from './Student';
import { TextbookCopy } from './TextbookCopy';
import { User } from './User';

@Entity('inventory_library_loans')
@Index(['studentId'])
@Index(['copyId', 'returnedAt'])
export class LibraryLoan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @ManyToOne(() => TextbookCopy, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'copyId' })
  copy: TextbookCopy;

  @Column()
  copyId: string;

  @CreateDateColumn()
  borrowedAt: Date;

  @Column({ type: 'timestamp' })
  dueAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  overdueDays: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorizedByUserId' })
  authorizedBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  authorizedByUserId: string | null;
}
