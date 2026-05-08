import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type ReleaseStatus = 'released' | 'scheduled' | 'pending' | 'draft';

@Entity('report_releases')
export class ReportRelease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  term: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'varchar', default: 'end_term' })
  examType: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: ReleaseStatus;

  @Column({ type: 'date', nullable: true })
  releasedDate: string | null;

  @Column({ type: 'timestamp', nullable: true })
  scheduledRelease: string | null;

  @Column({ type: 'varchar', nullable: true })
  releasedBy: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
