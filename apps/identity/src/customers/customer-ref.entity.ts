import { Column, Entity } from 'typeorm';
import { ReplicaEntity } from '@cargo/messaging';

/**
 * Local copy of the customers owned by master-data (topic masterdata.customers.v1), used to
 * check the customerId of CUSTOMER users without calling another service.
 */
@Entity('customer_refs')
export class CustomerRef extends ReplicaEntity {
  @Column({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ name: 'is_active' })
  isActive!: boolean;
}
