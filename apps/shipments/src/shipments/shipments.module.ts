import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { ShipmentPackage } from './entities/shipment-package.entity';
import { ShipmentContainer } from './entities/shipment-container.entity';
import { TrackingEvent } from './entities/tracking-event.entity';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { TrackingController } from './tracking.controller';
import { FreightController } from './freight.controller';
import { RefsModule } from '../refs/refs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment, ShipmentPackage, ShipmentContainer, TrackingEvent]),
    RefsModule,
  ],
  controllers: [ShipmentsController, TrackingController, FreightController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
