import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('payroll_run_lines')
@Index(['payrollRunId'])
@Index(['employeeId'])
export class PayrollRunLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  payrollRunId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  // Snapshot fields for payslips
  @Column({ type: 'varchar' })
  employeeNumber: string;

  @Column({ type: 'varchar' })
  employeeName: string;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @Column({ type: 'varchar', nullable: true })
  salaryType: string | null;

  @Column({ type: 'uuid', nullable: true })
  salaryStructureId: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  basicSalary: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalAllowances: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDeductions: number;

  // Allow adjustments before approval (extra amounts)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  extraAllowances: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  extraDeductions: number;

  @Column({ type: 'text', nullable: true })
  adjustmentNotes: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  netSalary: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

