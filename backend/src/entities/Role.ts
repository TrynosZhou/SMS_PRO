import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'varchar', default: '' })
  description: string;

  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Stores array of permission IDs assigned to this role
  @Column({ type: 'jsonb', default: [] })
  permissionIds: string[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
