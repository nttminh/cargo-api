import { join } from 'path';
import { ServiceDataSourceOptions } from '@cargo/common';
import { User } from '../users/user.entity';
import { CustomerRef } from '../customers/customer-ref.entity';

/** Everything stored in the identity database. */
export const identityDb: ServiceDataSourceOptions = {
  entities: [User, CustomerRef],
  migrationsDir: join(__dirname, 'migrations'),
};
