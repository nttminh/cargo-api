import { join } from 'path';
import { OutboxMessage } from '@cargo/messaging';
import { ServiceDataSourceOptions } from '@cargo/common';
import { Customer } from '../customers/customer.entity';
import { Location } from '../locations/location.entity';
import { Carrier } from '../carriers/carrier.entity';

/** Everything stored in the master-data database. */
export const masterDataDb: ServiceDataSourceOptions = {
  entities: [Customer, Location, Carrier, OutboxMessage],
  migrationsDir: join(__dirname, 'migrations'),
};
