import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export type PayrollLeaveStaffType = 'teaching' | 'ancillary';

@Entity('payroll_leave_records')
@Index(['staffType', 'staffId'])
@Index(['leaveDate'])
export class PayrollLeaveRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  staffType: PayrollLeaveStaffType;

  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'varchar' })
  staffName: string;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @Column({ type: 'date' })
  leaveDate: Date;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  days: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
