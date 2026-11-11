import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import {
  CreateShipmentDto,
  CreateTrackingEventDto,
  ShipmentQueryDto,
  UpdateShipmentDto,
  UpdateStatusDto,
} from './dto/shipment.dto';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';

@ApiTags('shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create an air or sea shipment (CUSTOMER users create booking requests for themselves)',
  })
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: AuthUser) {
    return this.shipments.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List shipments (CUSTOMER users only see their own)' })
  findAll(@Query() q: ShipmentQueryDto, @CurrentUser() user: AuthUser) {
    return this.shipments.findAll(q, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.shipments.findOne(id, user);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Edit booking details (only before departure)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shipments.update(id, dto, user);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post(':id/status')
  @ApiOperation({
    summary: 'Advance shipment status (validated state machine) and log a tracking event',
  })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shipments.changeStatus(id, dto, user);
  }

  @Get(':id/events')
  listEvents(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.shipments.listEvents(id, user);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post(':id/events')
  @ApiOperation({ summary: 'Add an informational milestone (no status change)' })
  addEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTrackingEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shipments.addEvent(id, dto, user);
  }
}
