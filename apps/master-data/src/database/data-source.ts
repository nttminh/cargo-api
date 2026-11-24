/** DataSource for the TypeORM CLI and scripts (migrations, seed) of the master-data service. */
import '@cargo/common/time/force-utc';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadEnv } from '@cargo/common';
import { masterDataDb } from './entities';

loadEnv('master-data');

export default new DataSource(buildDataSourceOptions(masterDataDb));
