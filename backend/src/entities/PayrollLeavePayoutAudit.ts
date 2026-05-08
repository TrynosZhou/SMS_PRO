import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { PayrollLeaveStaffType } from './PayrollLeaveRecord';

@Entity('payroll_leave_payout_audits')
@Index(['staffType', 'staffId'])
@Index(['asOfDate'])
export class PayrollLeavePayoutAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  staffType: PayrollLeaveStaffType;

  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'varchar' })
  employeeNumber: string;

  @Column({ type: 'varchar' })
  fullName: string;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @Column({ type: 'date' })
  asOfDate: Date;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  remainingDays: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  dailyRate: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  payoutAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
