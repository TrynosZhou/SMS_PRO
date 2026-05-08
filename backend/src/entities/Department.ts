import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, OneToMany } from 'typeorm';
import { Subject } from './Subject';

@Entity('departments')
@Index(['name'], { unique: true })
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Subject, (subject) => subject.department)
  subjects: Subject[];
}

