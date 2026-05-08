import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';
import { UserRole } from './User';

/** Table is created via migration / `ensureUserActivityLogTable`; do not let `synchronize` rewrite legacy rows/columns. */
@Entity('user_activity_logs', { synchronize: false })
@Index(['userId'])
@Index(['loginAt'])
export class UserActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  username: string;

  @Column({
    type: 'enum',
    enum: [UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPERADMIN],
  })
  role: UserRole;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  loginAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  logoutAt: Date | null;

  // Newline-separated list of menu routes accessed during the session.
  @Column({ type: 'text', nullable: true })
  menusAccessed: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastMenuAccessed: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP'
  })
  updatedAt: Date;
}

