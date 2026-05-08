import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Student } from './Student';
import { User } from './User';

@Entity('inventory_audit_logs')
@Index(['createdAt'])
@Index(['entityType', 'entityId'])
export class InventoryAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 64 })
  entityType: string;

  @Column({ type: 'varchar', length: 64 })
  entityId: string;

  @ManyToOne(() => Student, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'studentId' })
  student: Student | null;

  @Column({ type: 'uuid', nullable: true })
  studentId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'performedByUserId' })
  performedBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  performedByUserId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
