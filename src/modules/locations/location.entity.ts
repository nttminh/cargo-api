import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { LocationType } from '../../common/enums';
import { numericTransformer } from '../../common/utils/numeric.transformer';

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

  /** IANA time zone, e.g. Asia/Ho_Chi_Minh */
  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone!: string | null;

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
