import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('payroll_payslips')
@Index(['payrollRunLineId'])
export class PayrollPayslip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  payrollRunLineId: string;

  @Column({ type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ type: 'varchar' })
  periodLabel: string;

  // Files are stored under uploads/payrolls/<periodLabel>/...
  @Column({ type: 'text', nullable: true })
  pdfPath: string | null;

  @Column({ type: 'timestamp', nullable: true })
  generatedAt: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

