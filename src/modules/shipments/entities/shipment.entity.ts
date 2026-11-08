import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Incoterm, LoadType, ShipmentStatus, TransportMode } from '../../../common/enums';
import { numericTransformer } from '../../../common/utils/numeric.transformer';
import { Customer } from '../../customers/customer.entity';
import { Carrier } from '../../carriers/carrier.entity';
import { Location } from '../../locations/location.entity';
import { User } from '../../users/user.entity';
import { ShipmentPackage } from './shipment-package.entity';
import { ShipmentContainer } from './shipment-container.entity';
import { TrackingEvent } from './tracking-event.entity';

/** Shipper / consignee / notify party, stored as JSONB. */
export interface Party {
  name: string;
  address?: string;
  city?: string;
  countryCode?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  taxId?: string;
}

const num = (precision: number, scale: number, nullable = false) => ({
  type: 'numeric' as const,
  precision,
  scale,
  nullable,
  transformer: numericTransformer,
});

@Entity('shipments')
@Check('chk_shipments_route', '"origin_id" <> "destination_id"')
@Index('ix_shipments_customer_created', ['customerId', 'createdAt'])
@Index('ix_shipments_status', ['status'])
@Index('ix_shipments_mode_status', ['mode', 'status'])
export class Shipment extends BaseEntity {
  /** Human-friendly unique reference, e.g. AIR-2611-000042 */
  @Index('uq_shipments_reference', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  reference!: string;

  @Column({ type: 'enum', enum: TransportMode, enumName: 'transport_mode' })
  mode!: TransportMode;

  @Column({ name: 'load_type', type: 'enum', enum: LoadType, enumName: 'load_type' })
  loadType!: LoadType;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    enumName: 'shipment_status',
    default: ShipmentStatus.DRAFT,
  })
  status!: ShipmentStatus;

  // ---- Parties -------------------------------------------------------------
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id', foreignKeyConstraintName: 'fk_shipments_customer_id' })
  customer?: Customer;

  @Column({ type: 'jsonb' })
  shipper!: Party;

  @Column({ type: 'jsonb' })
  consignee!: Party;

  @Column({ name: 'notify_party', type: 'jsonb', nullable: true })
  notifyParty!: Party | null;

  // ---- Routing -------------------------------------------------------------
  @Column({ name: 'origin_id', type: 'uuid' })
  originId!: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'origin_id', foreignKeyConstraintName: 'fk_shipments_origin_id' })
  origin?: Location;

  @Column({ name: 'destination_id', type: 'uuid' })
  destinationId!: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_id', foreignKeyConstraintName: 'fk_shipments_destination_id' })
  destination?: Location;

  @Column({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId!: string | null;

  @ManyToOne(() => Carrier, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'carrier_id', foreignKeyConstraintName: 'fk_shipments_carrier_id' })
  carrier?: Carrier | null;

  @Column({ type: 'enum', enum: Incoterm, enumName: 'incoterm', nullable: true })
  incoterm!: Incoterm | null;

  // ---- Transport documents & voyage ---------------------------------------
  /** MAWB (air) or MBL (sea) */
  @Index('ix_shipments_master_doc')
  @Column({ type: 'varchar', name: 'master_document_no', length: 40, nullable: true })
  masterDocumentNo!: string | null;

  /** HAWB (air) or HBL (sea) */
  @Index('ix_shipments_house_doc')
  @Column({ type: 'varchar', name: 'house_document_no', length: 40, nullable: true })
  houseDocumentNo!: string | null;

  @Column({ type: 'varchar', name: 'flight_number', length: 10, nullable: true })
  flightNumber!: string | null;

  @Column({ type: 'varchar', name: 'vessel_name', length: 100, nullable: true })
  vesselName!: string | null;

  @Column({ type: 'varchar', name: 'voyage_number', length: 20, nullable: true })
  voyageNumber!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  etd!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  eta!: Date | null;

  /** Actual time of departure */
  @Column({ type: 'timestamptz', nullable: true })
  atd!: Date | null;

  /** Actual time of arrival */
  @Column({ type: 'timestamptz', nullable: true })
  ata!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  // ---- Cargo summary (derived from packages) -------------------------------
  @Column({ type: 'varchar', name: 'commodity_description', length: 500 })
  commodityDescription!: string;

  @Column({ name: 'total_pieces', type: 'int', default: 0 })
  totalPieces!: number;

  @Column({ name: 'gross_weight_kg', ...num(12, 3), default: 0 })
  grossWeightKg!: number;

  @Column({ name: 'volume_cbm', ...num(12, 4), default: 0 })
  volumeCbm!: number;

  @Column({ name: 'chargeable_weight_kg', ...num(12, 3, true) })
  chargeableWeightKg!: number | null;

  @Column({ name: 'revenue_tons', ...num(12, 3, true) })
  revenueTons!: number | null;

  @Column({ name: 'is_hazardous', default: false })
  isHazardous!: boolean;

  @Column({ name: 'declared_value', ...num(14, 2, true) })
  declaredValue!: number | null;

  /** ISO 4217 */
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency!: string | null;

  @Column({ name: 'special_instructions', type: 'text', nullable: true })
  specialInstructions!: string | null;

  // ---- Children ------------------------------------------------------------
  @OneToMany(() => ShipmentPackage, (p) => p.shipment, { cascade: true })
  packages?: ShipmentPackage[];

  @OneToMany(() => ShipmentContainer, (c) => c.shipment, { cascade: true })
  containers?: ShipmentContainer[];

  @OneToMany(() => TrackingEvent, (e) => e.shipment)
  events?: TrackingEvent[];

  // ---- Audit ---------------------------------------------------------------
  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id', foreignKeyConstraintName: 'fk_shipments_created_by_id' })
  createdBy?: User | null;
}
