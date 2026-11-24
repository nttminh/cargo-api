import { Column, Entity, Index } from 'typeorm';
import { LocationType, numericTransformer, TransportMode } from '@cargo/common';
import { ReplicaEntity } from '@cargo/messaging';

/*
 * Local, read-only copies of master data owned by the master-data service, kept in sync from
 * Kafka (masterdata.*.v1). Shipments validate against and join with these tables, so creating
 * or listing shipments never calls another service.
 */

@Entity('customer_refs')
export class CustomerRef extends ReplicaEntity {
  @Column({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ name: 'company_name', type: 'varchar', length: 200 })
  companyName!: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode!: string;

  @Column({ name: 'is_active' })
  isActive!: boolean;
}

@Entity('location_refs')
@Index('ix_location_refs_code', ['code'])
export class LocationRef extends ReplicaEntity {
  @Column({ type: 'enum', enum: LocationType, enumName: 'location_type' })
  type!: LocationType;

  @Column({ type: 'varchar', length: 5 })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode!: string;

  /** IANA time zone; ETD/ETA at this location default to it. */
  @Column({ type: 'varchar', length: 64 })
  timezone!: string;

  @Column({
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  latitude!: number | null;

  @Column({
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  longitude!: number | null;

  @Column({ name: 'is_active' })
  isActive!: boolean;
}

@Entity('carrier_refs')
export class CarrierRef extends ReplicaEntity {
  @Column({ type: 'enum', enum: TransportMode, enumName: 'transport_mode' })
  mode!: TransportMode;

  @Column({ type: 'varchar', length: 4 })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'awb_prefix', type: 'varchar', length: 3, nullable: true })
  awbPrefix!: string | null;

  @Column({ name: 'is_active' })
  isActive!: boolean;
}
