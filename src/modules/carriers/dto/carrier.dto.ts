import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { TransportMode } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateCarrierDto {
  @ApiProperty({ enum: TransportMode })
  @IsEnum(TransportMode)
  mode!: TransportMode;

  @ApiProperty({ example: 'MAEU', description: 'IATA 2-char (air) or SCAC 4-letter (sea)' })
  @Transform(upper)
  @Matches(/^[A-Z0-9]{2,4}$/)
  code!: string;

  @ApiPropertyOptional({ example: '738', description: 'Air only: IATA 3-digit AWB prefix' })
  @IsOptional()
  @Matches(/^\d{3}$/)
  awbPrefix?: string;

  @ApiProperty({ example: 'Maersk Line' })
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiPropertyOptional({ example: 'https://carrier.example/track?ref={ref}' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  trackingUrlTemplate?: string;
}

export class UpdateCarrierDto extends PartialType(CreateCarrierDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CarrierQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TransportMode })
  @IsOptional()
  @IsEnum(TransportMode)
  mode?: TransportMode;
}
