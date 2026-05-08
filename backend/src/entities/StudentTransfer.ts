import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Student } from './Student';
import { Class } from './Class';
import { User } from './User';

export enum TransferType {
  INTERNAL = 'internal',
  EXTERNAL = 'external'
}

@Entity('student_transfers')
@Index(['studentId', 'transferDate'])
@Index(['transferType'])
@Index(['transferDate'])
export class StudentTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({
    type: 'enum',
    enum: TransferType,
    default: TransferType.INTERNAL
  })
  transferType: TransferType;

  // For internal transfers
  @Column({ type: 'uuid', nullable: true })
  previousClassId: string | null;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'previousClassId' })
  previousClass: Class | null;

  @Column({ type: 'uuid', nullable: true })
  newClassId: string | null;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'newClassId' })
  newClass: Class | null;

  // For external transfers
  @Column({ nullable: true })
  destinationSchool: string | null;

  // School names for external transfers (fromSchoolName = current school, toSchoolName = destination)
  @Column({ nullable: true })
  fromSchoolName: string | null;

  @Column({ nullable: true })
  toSchoolName: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'date' })
  transferDate: Date;

  @Column({ type: 'date', nullable: true })
  effectiveDate: Date | null;

  @Column({ type: 'uuid' })
  processedByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'processedByUserId' })
  processedBy: User;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}

