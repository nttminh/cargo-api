import { Column, Entity, Index } from 'typeorm';
import { LocationSnapshot } from '@cargo/messaging';
import { BaseEntity, LocationType, numericTransformer } from '@cargo/common';

/**
 * Airport (IATA 3-letter code, e.g. SGN) or seaport (UN/LOCODE 5-char code, e.g. VNSGN).
 */
@Entity('locations')
@Index('uq_locations_type_code', ['type', 'code'], { unique: true })
export class Location extends BaseEntity {
  @Column({ type: 'enum', enum: LocationType, enumName: 'location_type' })
  type!: LocationType;

  @Column({ type: 'varchar', length: 5 })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  /** ISO 3166-1 alpha-2 */
  @Column({ type: 'varchar', name: 'country_code', length: 2 })
  countryCode!: string;

  /** IANA time zone, e.g. Asia/Ho_Chi_Minh. Schedules at this location are local to it. */
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

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

/** What other services get to know about a location (see masterdata.locations.v1). */
export const toLocationSnapshot = (l: Location): LocationSnapshot => ({
  id: l.id,
  version: l.version,
  type: l.type,
  code: l.code,
  name: l.name,
  city: l.city,
  countryCode: l.countryCode,
  timezone: l.timezone,
  latitude: l.latitude,
  longitude: l.longitude,
  isActive: l.isActive,
});
