import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ContainerType,
  Incoterm,
  LoadType,
  PackageType,
  ShipmentStatus,
  TransportMode,
} from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { IsContainerNumber } from '../domain/validators';
import { IsOptionalInstant, ScheduleTimeDto } from '../../../common/time/validation';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class PartyDto {
  @ApiProperty({ example: 'Saigon Garments Co.' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 500) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) city?: string;

  @ApiPropertyOptional({ example: 'VN' })
  @IsOptional()
  @Transform(upper)
  @IsISO31661Alpha2()
  countryCode?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 150) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) taxId?: string;
}

export class PackageDto {
  @ApiProperty({ example: 'Cotton T-shirts' })
  @IsString()
  @Length(1, 255)
  description!: string;

  @ApiProperty({ enum: PackageType })
  @IsEnum(PackageType)
  packageType!: PackageType;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;

  @ApiProperty({ example: 120.5, description: 'Gross weight per piece (kg)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  weightKg!: number;

  @ApiPropertyOptional({ example: 120 }) @IsOptional() @IsNumber() @IsPositive() lengthCm?: number;
  @ApiPropertyOptional({ example: 80 }) @IsOptional() @IsNumber() @IsPositive() widthCm?: number;
  @ApiPropertyOptional({ example: 100 }) @IsOptional() @IsNumber() @IsPositive() heightCm?: number;

  @ApiPropertyOptional({ example: '610910' })
  @IsOptional()
  @Matches(/^\d{6,10}$/, { message: 'hsCode must be 6-10 digits' })
  hsCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isHazardous?: boolean;

  @ApiPropertyOptional({ example: 'UN1263' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^UN\d{4}$/)
  unNumber?: string;
}

export class ContainerDto {
  @ApiProperty({ example: 'CSQU3054383' })
  @Transform(upper)
  @IsContainerNumber()
  containerNumber!: string;

  @ApiProperty({ enum: ContainerType, example: ContainerType.HC40 })
  @IsEnum(ContainerType)
  containerType!: ContainerType;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 30) sealNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() tareWeightKg?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() vgmKg?: number;

  @ApiPropertyOptional({ description: 'Reefer set point degrees C' })
  @IsOptional()
  @IsNumber()
  @Min(-60)
  @Max(40)
  temperatureC?: number;
}

export class CreateShipmentDto {
  @ApiProperty({ enum: TransportMode })
  @IsEnum(TransportMode)
  mode!: TransportMode;

  @ApiPropertyOptional({
    enum: LoadType,
    description: 'SEA: FCL or LCL (default LCL). AIR: always LOOSE.',
  })
  @IsOptional()
  @IsEnum(LoadType)
  loadType?: LoadType;

  @ApiPropertyOptional({ description: 'Ignored (forced) for CUSTOMER users' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ type: PartyDto })
  @ValidateNested()
  @Type(() => PartyDto)
  shipper!: PartyDto;

  @ApiProperty({ type: PartyDto })
  @ValidateNested()
  @Type(() => PartyDto)
  consignee!: PartyDto;

  @ApiPropertyOptional({ type: PartyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartyDto)
  notifyParty?: PartyDto;

  @ApiProperty({ description: 'Origin airport/seaport id' })
  @IsUUID()
  originId!: string;

  @ApiProperty({ description: 'Destination airport/seaport id' })
  @IsUUID()
  destinationId!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() carrierId?: string;

  @ApiPropertyOptional({ enum: Incoterm })
  @IsOptional()
  @IsEnum(Incoterm)
  incoterm?: Incoterm;

  @ApiPropertyOptional({ description: 'MAWB (e.g. 738-12345675) or MBL' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(3, 40)
  masterDocumentNo?: string;

  @ApiPropertyOptional({ description: 'HAWB or HBL' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Length(3, 40)
  houseDocumentNo?: string;

  @ApiPropertyOptional({ example: 'VN301' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/, { message: 'flightNumber must look like VN301' })
  flightNumber?: string;

  @ApiPropertyOptional({ example: 'MAERSK EMDEN' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  vesselName?: string;

  @ApiPropertyOptional({ example: '245W' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  voyageNumber?: string;

  @ApiPropertyOptional({
    type: ScheduleTimeDto,
    description: 'Estimated departure, local to the origin port. null clears it on update.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleTimeDto)
  etd?: ScheduleTimeDto | null;

  @ApiPropertyOptional({
    type: ScheduleTimeDto,
    description: 'Estimated arrival, local to the destination port. null clears it on update.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleTimeDto)
  eta?: ScheduleTimeDto | null;

  @ApiProperty({ example: 'Garments, HS 6109' })
  @IsString()
  @Length(2, 500)
  commodityDescription!: string;

  @ApiProperty({ type: [PackageDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PackageDto)
  packages!: PackageDto[];

  @ApiPropertyOptional({ type: [ContainerDto], description: 'SEA only' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ContainerDto)
  containers?: ContainerDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declaredValue?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @Transform(upper)
  @IsISO4217CurrencyCode()
  currency?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 5000) specialInstructions?: string;
}

/** Mode and customer cannot be changed after creation. */
export class UpdateShipmentDto extends PartialType(
  OmitType(CreateShipmentDto, ['mode', 'customerId'] as const),
) {}

export class ShipmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TransportMode })
  @IsOptional()
  @IsEnum(TransportMode)
  mode?: TransportMode;

  @ApiPropertyOptional({ enum: ShipmentStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(ShipmentStatus, { each: true })
  status?: ShipmentStatus[];

  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() carrierId?: string;

  @ApiPropertyOptional({ example: 'SGN', description: 'Origin location code' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  origin?: string;

  @ApiPropertyOptional({ example: 'LAX', description: 'Destination location code' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  destination?: string;

  @IsOptionalInstant('ETD on or after this instant') etdFrom?: Date;
  @IsOptionalInstant('ETD on or before this instant') etdTo?: Date;

  @ApiPropertyOptional({ enum: ['createdAt', 'etd', 'eta', 'reference'], default: 'createdAt' })
  @IsOptional()
  @IsEnum(['createdAt', 'etd', 'eta', 'reference'])
  sortBy: 'createdAt' | 'etd' | 'eta' | 'reference' = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @Transform(upper)
  @IsEnum(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}

export class UpdateStatusDto {
  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @ApiPropertyOptional({ description: 'Where it happened' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Defaults to a generated description' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptionalInstant('Defaults to now') occurredAt?: Date;
}

export class CreateTrackingEventDto {
  @ApiProperty({ example: 'LOADED_ON_VESSEL' })
  @Transform(upper)
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/)
  code!: string;

  @ApiProperty({ example: 'Container loaded on board MAERSK EMDEN' })
  @IsString()
  @Length(1, 500)
  description!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;

  @IsOptionalInstant('Defaults to now') occurredAt?: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
