import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('fee_items')
export class FeeItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  categoryId: string; // FK → fee_categories.id

  @Column({ type: 'varchar' })
  subCategory: string; // e.g. "Day Scholars" | "Boarders"

  @Column({ type: 'varchar' })
  itemName: string; // e.g. "Tuition Fee"

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'varchar', default: 'USD' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
