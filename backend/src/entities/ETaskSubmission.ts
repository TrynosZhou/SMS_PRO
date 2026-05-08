import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique
} from 'typeorm';
import { ETask } from './ETask';
import { Student } from './Student';

@Entity('e_task_submissions')
@Unique(['eTaskId', 'studentId'])
export class ETaskSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  eTaskId: string;

  @ManyToOne(() => ETask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eTaskId' })
  eTask: ETask;

  @Column({ type: 'uuid' })
  @Index()
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  /** Public URL path e.g. /uploads/etasks/submissions/filename.pdf */
  @Column({ type: 'varchar' })
  fileUrl: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn()
  submittedAt: Date;
}
