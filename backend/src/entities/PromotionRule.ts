import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Class } from './Class';

@Entity('promotion_rules')
@Index(['fromClassId'], { unique: true })
export class PromotionRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromClassId' })
  fromClass: Class;

  @Column()
  fromClassId: string;

  @ManyToOne(() => Class, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'toClassId' })
  toClass: Class | null;

  @Column({ nullable: true })
  toClassId: string | null;

  @Column({ default: false })
  isFinalClass: boolean;

  @Column({ default: true })
  isActive: boolean;

  /** If set (e.g. 50), student must have at least this overall % (active term, end-of-term) to be treated as eligible for promotion. */
  @Column({ type: 'float', nullable: true })
  minimumAveragePercent: number | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

