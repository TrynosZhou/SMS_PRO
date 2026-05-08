import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Student } from './Student';
import { Teacher } from './Teacher';

@Entity('inventory_furniture_items')
@Index(['itemType'])
@Index(['status'])
export class FurnitureItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  itemType: string;

  @Column({ unique: true })
  itemCode: string;

  @Column({ type: 'varchar', length: 32 })
  condition: string;

  @Column({ type: 'varchar', nullable: true })
  classroomLocation: string | null;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  /** When status is `with_teacher`, the class teacher holding this item for later issue to students. */
  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentTeacherId' })
  currentTeacher: Teacher | null;

  @Column({ type: 'uuid', nullable: true })
  currentTeacherId: string | null;

  @ManyToOne(() => Student, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentStudentId' })
  currentStudent: Student | null;

  @Column({ type: 'uuid', nullable: true })
  currentStudentId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lostAt: Date | null;

  @ManyToOne(() => Student, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accountableStudentId' })
  accountableStudent: Student | null;

  @Column({ type: 'uuid', nullable: true })
  accountableStudentId: string | null;
}
