import { Column, Entity, Index } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity, UserRole } from '@cargo/common';

@Entity('users')
export class User extends BaseEntity {
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Exclude()
  @Column({ type: 'varchar', name: 'password_hash', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', name: 'full_name', length: 150 })
  fullName!: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.CUSTOMER })
  role!: UserRole;

  /**
   * Set for CUSTOMER users: restricts data access to this customer's shipments. The customer is
   * owned by the master-data service; it is checked against the local replica (customer_refs).
   */
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
}
