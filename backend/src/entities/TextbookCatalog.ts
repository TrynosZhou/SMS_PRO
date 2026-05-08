import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { TextbookCopy } from './TextbookCopy';

@Entity('inventory_textbook_catalog')
export class TextbookCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'varchar', nullable: true })
  isbn: string | null;

  @Column({ type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'varchar', nullable: true })
  gradeLevel: string | null;

  @OneToMany(() => TextbookCopy, c => c.catalog)
  copies: TextbookCopy[];

  @CreateDateColumn()
  createdAt: Date;
}
