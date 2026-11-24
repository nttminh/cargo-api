import '@cargo/common/time/force-utc';
import { bootstrapService } from '@cargo/common';
import { IdentityModule } from './identity.module';

bootstrapService(IdentityModule, { name: 'identity', title: 'Cargo identity' });
