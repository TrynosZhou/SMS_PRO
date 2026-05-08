import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { Teacher } from './Teacher';
import { Class } from './Class';

export type ETaskType = 'assignment' | 'test' | 'notes';

@Entity('e_tasks')
export class ETask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20 })
  taskType: ETaskType;

  @Column({ type: 'uuid' })
  teacherId: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @Column({ type: 'uuid' })
  classId: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  classEntity: Class;

  /** Public URL path e.g. /uploads/etasks/filename.pdf */
  @Column({ type: 'varchar', nullable: true })
  attachmentUrl: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: Date | null;

  @CreateDateColumn()
  sentAt: Date;
}
