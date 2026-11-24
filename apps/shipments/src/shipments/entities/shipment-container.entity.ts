import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ContainerType, numericTransformer } from '@cargo/common';
import { Shipment } from './shipment.entity';

/** Ocean container assigned to an FCL/LCL sea shipment. */
@Entity('shipment_containers')
@Index('uq_shipment_containers_number', ['shipmentId', 'containerNumber'], { unique: true })
export class ShipmentContainer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string;

  @ManyToOne(() => Shipment, (s) => s.containers, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  @JoinColumn({
    name: 'shipment_id',
    foreignKeyConstraintName: 'fk_shipment_containers_shipment_id',
  })
  shipment?: Shipment;

  /** ISO 6346, e.g. MSCU1234565 */
  @Index('ix_shipment_containers_number')
  @Column({ type: 'varchar', name: 'container_number', length: 11 })
  containerNumber!: string;

  @Column({ name: 'container_type', type: 'enum', enum: ContainerType, enumName: 'container_type' })
  containerType!: ContainerType;

  @Column({ type: 'varchar', name: 'seal_number', length: 30, nullable: true })
  sealNumber!: string | null;

  @Column({
    name: 'tare_weight_kg',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  tareWeightKg!: number | null;

  /** Verified gross mass (SOLAS VGM) */
  @Column({
    name: 'vgm_kg',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  vgmKg!: number | null;

  /** Reefer set temperature, degrees C */
  @Column({
    name: 'temperature_c',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  temperatureC!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
