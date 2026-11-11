import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { ShipmentPackage } from './entities/shipment-package.entity';
import { ShipmentContainer } from './entities/shipment-container.entity';
import { TrackingEvent } from './entities/tracking-event.entity';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment, ShipmentPackage, ShipmentContainer, TrackingEvent]),
  ],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
