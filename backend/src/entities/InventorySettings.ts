import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('inventory_settings')
export class InventorySettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', default: 14 })
  libraryLoanDaysDefault: number;

  /** Amount per calendar day overdue when a borrowed book is returned late */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 1 })
  overdueFinePerDay: string;

  /**
   * After this many days past the loan due date without return, loans can be auto-marked lost
   * (manual/scheduled job via API).
   */
  @Column({ type: 'int', default: 30 })
  autoLossDaysAfterDue: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
