import { Column, Entity, Index } from 'typeorm';
import { CarrierSnapshot } from '@cargo/messaging';
import { BaseEntity, TransportMode } from '@cargo/common';

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

/** What other services get to know about a carrier (see masterdata.carriers.v1). */
export const toCarrierSnapshot = (c: Carrier): CarrierSnapshot => ({
  id: c.id,
  version: c.version,
  mode: c.mode,
  code: c.code,
  name: c.name,
  awbPrefix: c.awbPrefix,
  isActive: c.isActive,
});
