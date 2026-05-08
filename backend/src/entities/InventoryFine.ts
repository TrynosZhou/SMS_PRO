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
import { LibraryLoan } from './LibraryLoan';
import { FurnitureItem } from './FurnitureItem';
import { TextbookCopy } from './TextbookCopy';
import { User } from './User';

@Entity('inventory_fines')
@Index(['studentId'])
@Index(['status'])
export class InventoryFine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @Column({ type: 'varchar', length: 32 })
  fineType: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @ManyToOne(() => LibraryLoan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'libraryLoanId' })
  libraryLoan: LibraryLoan | null;

  @Column({ type: 'uuid', nullable: true })
  libraryLoanId: string | null;

  @ManyToOne(() => FurnitureItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'furnitureItemId' })
  furnitureItem: FurnitureItem | null;

  @Column({ type: 'uuid', nullable: true })
  furnitureItemId: string | null;

  @ManyToOne(() => TextbookCopy, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'textbookCopyId' })
  textbookCopy: TextbookCopy | null;

  @Column({ type: 'uuid', nullable: true })
  textbookCopyId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'recordedByUserId' })
  recordedBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  recordedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'paidRecordedByUserId' })
  paidRecordedBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  paidRecordedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
