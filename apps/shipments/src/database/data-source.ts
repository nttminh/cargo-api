/** DataSource for the TypeORM CLI and scripts (migrations, recompute) of the shipments service. */
import '@cargo/common/time/force-utc';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadEnv } from '@cargo/common';
import { shipmentsDb } from './entities';

loadEnv('shipments');

export default new DataSource(buildDataSourceOptions(shipmentsDb));
