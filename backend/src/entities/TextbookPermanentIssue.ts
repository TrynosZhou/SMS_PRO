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

@Entity('inventory_textbook_permanent_issues')
@Index(['studentId'])
@Index(['copyId', 'returnedAt'])
export class TextbookPermanentIssue {
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

  @Column({ type: 'varchar', nullable: true })
  courseLabel: string | null;

  @CreateDateColumn()
  issuedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorizedByUserId' })
  authorizedBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  authorizedByUserId: string | null;
}
