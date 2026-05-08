import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('fee_categories')
export class FeeCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string; // e.g. "O Level Fees"

  @Column({ type: 'varchar', default: '' })
  description: string; // e.g. "Ordinary Level Student Fees"

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
