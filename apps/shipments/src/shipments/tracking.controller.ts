import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { Public } from '@cargo/common';

@ApiTags('tracking (public)')
@Public()
@Controller('tracking')
export class TrackingController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get(':trackingNumber')
  @ApiOperation({ summary: 'Public shipment tracking by reference, AWB/MAWB, HAWB, MBL or HBL' })
  @ApiParam({ name: 'trackingNumber', example: 'AIR-2611-000001' })
  track(@Param('trackingNumber') trackingNumber: string) {
    return this.shipments.track(trackingNumber.slice(0, 40));
  }
}
