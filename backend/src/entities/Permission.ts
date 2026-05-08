import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string; // e.g. "students.view"

  @Column({ type: 'varchar' })
  description: string;

  @Column({ type: 'varchar' })
  module: string; // e.g. "students"

  @Column({ type: 'varchar' })
  action: string; // e.g. "view"

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
