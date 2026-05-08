import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum SalaryComponentType {
  ALLOWANCE = 'allowance',
  DEDUCTION = 'deduction',
}

@Entity('payroll_salary_components')
@Index(['structureId'])
@Index(['componentType'])
export class PayrollSalaryComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  structureId: string;

  @Column({
    type: 'enum',
    enum: SalaryComponentType,
    enumName: 'payroll_salarycomponenttype_enum',
    default: SalaryComponentType.ALLOWANCE,
  })
  componentType: SalaryComponentType;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  amount: number;
}

