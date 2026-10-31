import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('customers')
export class Customer extends BaseEntity {
  /** Short account code, e.g. ACME01 */
  @Index('uq_customers_code', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ type: 'varchar', name: 'company_name', length: 200 })
  companyName!: string;

  @Column({ type: 'varchar', name: 'contact_name', length: 150, nullable: true })
  contactName!: string | null;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', name: 'tax_id', length: 50, nullable: true })
  taxId!: string | null;

  @Column({ type: 'varchar', name: 'address_line1', length: 255, nullable: true })
  addressLine1!: string | null;

  @Column({ type: 'varchar', name: 'address_line2', length: 255, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', name: 'postal_code', length: 20, nullable: true })
  postalCode!: string | null;

  /** ISO 3166-1 alpha-2 */
  @Column({ type: 'varchar', name: 'country_code', length: 2 })
  countryCode!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
