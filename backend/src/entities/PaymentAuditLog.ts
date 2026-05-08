import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum PaymentAuditEventType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete'
}

export enum PaymentAuditAnomalyType {
  INVALID_AMOUNT = 'invalid_amount',
  DUPLICATE_REFERENCE = 'duplicate_reference',
  BACKDATED = 'backdated_transaction',
  EDITED_CONFIRMED = 'edited_confirmed_payment'
}

/** Schema aligned via `ensurePaymentAuditLogTable`; exclude from `synchronize` to avoid NOT NULL fights on legacy rows. */
@Entity('payment_audit_logs', { synchronize: false })
@Index(['studentId'])
@Index(['referenceNumber'])
@Index(['eventAt'])
export class PaymentAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  username: string;

  @Column()
  studentId: string;

  @Column({ nullable: true })
  studentNumber: string | null;

  @Column({ nullable: true })
  lastName: string | null;

  @Column({ nullable: true })
  firstName: string | null;

  // Optional linkage: cash receipts currently might not have a Payment row.
  @Column({ nullable: true })
  paymentId: string | null;

  @Column({ nullable: true })
  invoiceId: string | null;

  @Column('decimal', { precision: 10, scale: 2 })
  amountPaid: number;

  @Column({ type: 'varchar' })
  paymentMethod: string;

  @Column({ nullable: true })
  referenceNumber: string | null;

  // Timestamp of payment creation/modification (transaction time).
  @Column({ type: 'timestamp' })
  eventAt: Date;

  @Column({ type: 'enum', enum: PaymentAuditEventType, default: PaymentAuditEventType.CREATE })
  eventType: PaymentAuditEventType;

  @Column({ type: 'boolean', default: false })
  anomaly: boolean;

  @Column({ type: 'text', nullable: true })
  anomalyMessage: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

