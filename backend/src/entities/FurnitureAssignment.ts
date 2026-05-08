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
import { FurnitureItem } from './FurnitureItem';
import { User } from './User';

@Entity('inventory_furniture_assignments')
@Index(['studentId', 'revokedAt'])
export class FurnitureAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @ManyToOne(() => FurnitureItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deskItemId' })
  deskItem: FurnitureItem | null;

  @Column({ type: 'uuid', nullable: true })
  deskItemId: string | null;

  @ManyToOne(() => FurnitureItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'chairItemId' })
  chairItem: FurnitureItem | null;

  @Column({ type: 'uuid', nullable: true })
  chairItemId: string | null;

  @CreateDateColumn()
  issuedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorizedByUserId' })
  authorizedBy: User | null;

  @Column({ type: 'uuid', nullable: true })
  authorizedByUserId: string | null;
}
