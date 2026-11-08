import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PackageType } from '../../../common/enums';
import { numericTransformer } from '../../../common/utils/numeric.transformer';
import { Shipment } from './shipment.entity';

/** A line of cargo (n identical pieces). */
@Entity('shipment_packages')
@Check('chk_shipment_packages_quantity', '"quantity" > 0 AND "weight_kg" > 0')
export class ShipmentPackage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('ix_shipment_packages_shipment')
  @Column({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string;

  @ManyToOne(() => Shipment, (s) => s.packages, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  @JoinColumn({ name: 'shipment_id', foreignKeyConstraintName: 'fk_shipment_packages_shipment_id' })
  shipment?: Shipment;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ name: 'package_type', type: 'enum', enum: PackageType, enumName: 'package_type' })
  packageType!: PackageType;

  @Column({ type: 'int' })
  quantity!: number;

  /** Gross weight per piece */
  @Column({
    name: 'weight_kg',
    type: 'numeric',
    precision: 10,
    scale: 3,
    transformer: numericTransformer,
  })
  weightKg!: number;

  @Column({
    name: 'length_cm',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  lengthCm!: number | null;

  @Column({
    name: 'width_cm',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  widthCm!: number | null;

  @Column({
    name: 'height_cm',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  heightCm!: number | null;

  @Column({ type: 'varchar', name: 'hs_code', length: 12, nullable: true })
  hsCode!: string | null;

  @Column({ name: 'is_hazardous', default: false })
  isHazardous!: boolean;

  /** UN number for dangerous goods, e.g. UN1263 */
  @Column({ type: 'varchar', name: 'un_number', length: 6, nullable: true })
  unNumber!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
