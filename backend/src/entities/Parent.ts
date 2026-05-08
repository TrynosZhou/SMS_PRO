import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './User';
import { Student } from './Student';

@Entity('parents')
export class Parent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  email: string;

  /** Male / Female — captured at signup or admin creation */
  @Column({ type: 'varchar', nullable: true })
  gender: string | null;

  @OneToOne(() => User, user => user.parent)
  user: User;

  @Column({ nullable: true })
  userId: string;

  @OneToMany(() => Student, student => student.parent)
  students: Student[];
}

