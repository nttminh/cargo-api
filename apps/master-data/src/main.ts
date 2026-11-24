import '@cargo/common/time/force-utc';
import { bootstrapService } from '@cargo/common';
import { MasterDataModule } from './master-data.module';

bootstrapService(MasterDataModule, { name: 'master-data', title: 'Cargo master data' });
