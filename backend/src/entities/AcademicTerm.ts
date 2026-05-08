import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type TermStatus = 'active' | 'inactive' | 'upcoming';

@Entity('academic_terms')
export class AcademicTerm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  termNumber: number;

  @Column({ type: 'varchar', default: 'regular' })
  periodType: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({
    type: 'varchar',
    default: 'upcoming',
  })
  status: TermStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
