import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Student } from './Student';

export type FeeExemptionType = 'fixed' | 'percentage' | 'staff_sibling';

@Entity('student_fee_exemptions')
@Index(['studentId'])
export class StudentFeeExemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  /** fixed = discount amount off subtotal; percentage = 0–100 off each line; staff_sibling = no tuition / desk / registration (those lines waived) */
  @Column({ type: 'varchar', length: 32 })
  exemptionType: FeeExemptionType;

  /** Meaning depends on exemptionType (amount or percent) */
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  value: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
