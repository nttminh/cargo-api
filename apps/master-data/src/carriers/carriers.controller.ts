import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CarriersService } from './carriers.service';
import { CarrierQueryDto, CreateCarrierDto, UpdateCarrierDto } from './dto/carrier.dto';
import { Roles, UserRole } from '@cargo/common';

@ApiTags('carriers')
@ApiBearerAuth()
@Controller('carriers')
export class CarriersController {
  constructor(private readonly carriers: CarriersService) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  create(@Body() dto: CreateCarrierDto) {
    return this.carriers.create(dto);
  }

  @Get()
  findAll(@Query() q: CarrierQueryDto) {
    return this.carriers.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.carriers.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCarrierDto) {
    return this.carriers.update(id, dto);
  }
}
