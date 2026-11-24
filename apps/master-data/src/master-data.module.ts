import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import {
  AllExceptionsFilter,
  AuthCoreModule,
  baseEnv,
  configModule,
  dbEnv,
  HealthModule,
  jwtEnv,
  kafkaEnv,
  loggerModule,
  typeOrmModule,
} from '@cargo/common';
import { MessagingModule } from '@cargo/messaging';
import { masterDataDb } from './database/entities';
import { CustomersModule } from './customers/customers.module';
import { LocationsModule } from './locations/locations.module';
import { CarriersModule } from './carriers/carriers.module';

/**
 * Master data service: customers, airports/seaports and carriers. Owns this data and publishes
 * every change to Kafka (via the outbox) so other services keep local copies.
 */
@Module({
  imports: [
    configModule('master-data', baseEnv, jwtEnv, dbEnv, kafkaEnv),
    loggerModule('master-data'),
    typeOrmModule(masterDataDb),
    MessagingModule.forRoot({ clientId: 'master-data', outbox: true }),
    AuthCoreModule,
    HealthModule.forRoot({ database: true }),
    CustomersModule,
    LocationsModule,
    CarriersModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class MasterDataModule {}
