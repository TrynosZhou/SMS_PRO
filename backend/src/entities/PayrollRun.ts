import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { UserRole } from './User';

export enum PayrollRunStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

@Entity('payroll_runs')
@Index(['runYear'])
@Index(['runMonth'])
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  runMonth: number;

  @Column({ type: 'int' })
  runYear: number;

  @Column({ type: 'varchar' })
  periodLabel: string;

  @Column({
    type: 'enum',
    enum: PayrollRunStatus,
    enumName: 'payroll_runstatus_enum',
    default: PayrollRunStatus.DRAFT,
  })
  status: PayrollRunStatus;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

