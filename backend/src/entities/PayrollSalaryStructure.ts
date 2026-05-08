import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('payroll_salary_structures')
@Index(['salaryType'])
@Index(['isActive'])
export class PayrollSalaryStructure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  // Category used to select the correct structure (same value as PayrollEmployee.salaryType)
  @Column({ type: 'varchar' })
  salaryType: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  basicSalary: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Optional effective date for selecting latest structure for a payroll run.
  @Column({ type: 'date', nullable: true })
  effectiveFrom: Date | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

