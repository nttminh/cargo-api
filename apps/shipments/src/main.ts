import '@cargo/common/time/force-utc';
import { bootstrapService } from '@cargo/common';
import { ShipmentsAppModule } from './shipments-app.module';

bootstrapService(ShipmentsAppModule, { name: 'shipments', title: 'Cargo shipments' });
