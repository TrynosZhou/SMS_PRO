import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Invoice } from './Invoice';
import { UniformItem } from './UniformItem';

@Entity('invoice_uniform_items')
export class InvoiceUniformItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Invoice, invoice => invoice.uniformItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice: Invoice;

  @Column()
  invoiceId: string;

  @ManyToOne(() => UniformItem, { nullable: true })
  @JoinColumn({ name: 'uniformItemId' })
  uniformItem: UniformItem | null;

  @Column({ nullable: true })
  uniformItemId: string | null;

  @Column({ type: 'varchar', length: 150 })
  itemName: string;

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice: number;

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  lineTotal: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

