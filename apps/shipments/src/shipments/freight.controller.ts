import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public, TransportMode } from '@cargo/common';
import { PackageDto } from './dto/shipment.dto';
import { AIR_VOLUMETRIC_DIVISOR, calculateFreight } from './domain/freight-calculator';

class FreightCalculationDto {
  @ApiProperty({ enum: TransportMode })
  @IsEnum(TransportMode)
  mode!: TransportMode;

  @ApiProperty({ type: [PackageDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PackageDto)
  packages!: PackageDto[];
}

@ApiTags('freight')
@Controller('freight')
export class FreightController {
  @Public()
  @Post('calculate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Calculate volume, chargeable weight (air) and revenue tons (sea LCL)',
    description: `Air uses the IATA volumetric divisor ${AIR_VOLUMETRIC_DIVISOR} cm3/kg; sea uses W/M (1 t or 1 m3, min 1).`,
  })
  calculate(@Body() dto: FreightCalculationDto) {
    return calculateFreight(dto.mode, dto.packages);
  }
}
