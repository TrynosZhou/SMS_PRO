import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('payroll_leave_policies')
export class PayrollLeavePolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 30 })
  annualLeaveDaysPerYear: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 45 })
  excessAccruedThresholdDays: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  maxAccrualDays: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  carryForwardCapDays: number | null;

  @Column({ type: 'json', nullable: true })
  teachingTermMonths: number[] | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
