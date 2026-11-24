import { join } from 'path';
import { ServiceDataSourceOptions } from '@cargo/common';
import { OutboxMessage } from '@cargo/messaging';
import { Shipment } from '../shipments/entities/shipment.entity';
import { ShipmentPackage } from '../shipments/entities/shipment-package.entity';
import { ShipmentContainer } from '../shipments/entities/shipment-container.entity';
import { TrackingEvent } from '../shipments/entities/tracking-event.entity';
import { CarrierRef, CustomerRef, LocationRef } from '../refs/refs.entities';

/** Everything stored in the shipments database. */
export const shipmentsDb: ServiceDataSourceOptions = {
  entities: [
    Shipment,
    ShipmentPackage,
    ShipmentContainer,
    TrackingEvent,
    CustomerRef,
    LocationRef,
    CarrierRef,
    OutboxMessage,
  ],
  migrationsDir: join(__dirname, 'migrations'),
};
