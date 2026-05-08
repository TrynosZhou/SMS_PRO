import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { TimetableSlot } from './TimetableSlot';

@Entity('timetable_versions')
export class TimetableVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string; // e.g., "Term 1 2024", "Semester 1 Timetable"

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid', nullable: true })
  configId: string | null; // Reference to TimetableConfig used

  @Column({ type: 'boolean', default: false })
  isActive: boolean; // Only one active version at a time

  @Column({ type: 'boolean', default: false })
  isPublished: boolean; // Whether this version is published

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null; // User ID who created this version

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => TimetableSlot, slot => slot.version)
  slots: TimetableSlot[];
}

