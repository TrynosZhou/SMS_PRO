import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Invoice } from './Invoice';
import { Student } from './Student';

export enum PaymentMethod {
  CASH = 'cash',
  ECOCASH = 'ecocash',
  INNBUCKS = 'innbucks',
  VISA = 'visa',
  MASTERCARD = 'mastercard',
  BANK_TRANSFER = 'bank_transfer'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoiceId' })
  invoice: Invoice;

  @Column()
  invoiceId: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.CASH
  })
  paymentMethod: PaymentMethod;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING
  })
  status: PaymentStatus;

  @Column({ nullable: true })
  transactionId: string | null; // External payment gateway transaction ID

  @Column({ nullable: true })
  referenceNumber: string | null; // Payment reference number

  @Column({ nullable: true, type: 'text' })
  paymentDetails: string | null; // JSON string for payment-specific details (phone number, card last 4 digits, etc.)

  @Column({ nullable: true, type: 'text' })
  gatewayResponse: string | null; // Full response from payment gateway

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

