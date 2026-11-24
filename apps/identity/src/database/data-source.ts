/** DataSource for the TypeORM CLI and scripts (migrations, seed) of the identity service. */
import '@cargo/common/time/force-utc';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadEnv } from '@cargo/common';
import { identityDb } from './entities';

loadEnv('identity');

export default new DataSource(buildDataSourceOptions(identityDb));
