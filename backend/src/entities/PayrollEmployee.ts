import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum EmploymentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  TERMINATED = 'terminated',
}

@Entity('payroll_employees')
@Index(['department'])
@Index(['salaryType'])
@Index(['employmentStatus'])
export class PayrollEmployee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Human-readable employee identifier (e.g. EMP-001)
  @Column({ type: 'varchar', unique: true })
  employeeNumber: string;

  @Column({ type: 'varchar' })
  fullName: string;

  @Column({ type: 'varchar', nullable: true })
  designation: string | null;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  // Category used to select the correct SalaryStructure
  @Column({ type: 'varchar', nullable: true })
  salaryType: string | null;

  @Column({ type: 'date', nullable: true })
  salaryEffectiveFrom: Date | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  loanBalance: number;

  @Column({ type: 'varchar', nullable: true })
  bankName: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankAccountNumber: string | null;

  @Column({
    type: 'enum',
    enum: EmploymentStatus,
    enumName: 'payroll_employmentstatus_enum',
    default: EmploymentStatus.ACTIVE,
  })
  employmentStatus: EmploymentStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

