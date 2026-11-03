import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO31661Alpha2,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsTimeZone,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { LocationType } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateLocationDto {
  @ApiProperty({ enum: LocationType })
  @IsEnum(LocationType)
  type!: LocationType;

  @ApiProperty({ example: 'SGN', description: 'IATA (airport) or UN/LOCODE (seaport)' })
  @Transform(upper)
  @Matches(/^([A-Z]{3}|[A-Z]{2}[A-Z2-9]{3})$/, {
    message: 'code must be a 3-letter IATA code (airport) or 5-char UN/LOCODE (seaport)',
  })
  code!: string;

  @ApiProperty({ example: 'Tan Son Nhat International Airport' })
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiProperty({ example: 'Ho Chi Minh City' })
  @IsString()
  @Length(1, 100)
  city!: string;

  @ApiProperty({ example: 'VN' })
  @Transform(upper)
  @IsISO31661Alpha2()
  countryCode!: string;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class LocationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LocationType })
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @ApiPropertyOptional({ example: 'VN' })
  @IsOptional()
  @Transform(upper)
  @IsISO31661Alpha2()
  countryCode?: string;
}
