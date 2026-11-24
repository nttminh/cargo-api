import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateCustomerDto {
  @ApiProperty({ example: 'ACME01' })
  @Transform(upper)
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'code must be 2-20 chars [A-Z0-9_-]' })
  code!: string;

  @ApiProperty({ example: 'Acme Trading Ltd.' })
  @IsString()
  @Length(2, 200)
  companyName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  contactName?: string;

  @ApiProperty({ example: 'logistics@acme.example' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string;

  @ApiProperty({ example: 'VN', description: 'ISO 3166-1 alpha-2' })
  @Transform(upper)
  @IsISO31661Alpha2()
  countryCode!: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
