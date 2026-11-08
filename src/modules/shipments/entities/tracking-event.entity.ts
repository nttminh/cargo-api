import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ShipmentStatus } from '../../../common/enums';
import { Shipment } from './shipment.entity';
import { Location } from '../../locations/location.entity';

/** Append-only milestone / tracking log for a shipment. */
@Entity('tracking_events')
@Index('ix_tracking_events_shipment_time', ['shipmentId', 'occurredAt'])
export class TrackingEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string;

  @ManyToOne(() => Shipment, (s) => s.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipment_id', foreignKeyConstraintName: 'fk_tracking_events_shipment_id' })
  shipment?: Shipment;

  /** Set when this event changed the shipment status; null for informational milestones. */
  @Column({ type: 'enum', enum: ShipmentStatus, enumName: 'shipment_status', nullable: true })
  status!: ShipmentStatus | null;

  /** Short machine-friendly code, e.g. STATUS_CHANGE, LOADED_ON_VESSEL, CUSTOMS_DOCS_RECEIVED */
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId!: string | null;

  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'location_id', foreignKeyConstraintName: 'fk_tracking_events_location_id' })
  location?: Location | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  /** Visible on the public tracking page */
  @Column({ name: 'is_public', default: true })
  isPublic!: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
