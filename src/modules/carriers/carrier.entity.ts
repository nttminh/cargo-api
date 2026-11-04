import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TransportMode } from '../../common/enums';

/**
 * Airline (IATA 2-char code, e.g. VN) or ocean carrier / shipping line (SCAC 4-letter code, e.g. MAEU).
 */
@Entity('carriers')
@Index('uq_carriers_mode_code', ['mode', 'code'], { unique: true })
export class Carrier extends BaseEntity {
  @Column({ type: 'enum', enum: TransportMode, enumName: 'transport_mode' })
  mode!: TransportMode;

  @Column({ type: 'varchar', length: 4 })
  code!: string;

  /** Air only: 3-digit IATA airline prefix used in AWB numbers (e.g. 738) */
  @Column({ type: 'varchar', name: 'awb_prefix', length: 3, nullable: true })
  awbPrefix!: string | null;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'varchar', name: 'tracking_url_template', length: 500, nullable: true })
  trackingUrlTemplate!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
