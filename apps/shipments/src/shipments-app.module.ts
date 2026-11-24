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
import { shipmentsDb } from './database/entities';
import { ShipmentsModule } from './shipments/shipments.module';

/**
 * Shipments service: shipments, packages, containers, tracking events, public tracking and the
 * freight calculator. Keeps local copies of the master data it needs and publishes shipment
 * events (created, status changed) for other services.
 */
@Module({
  imports: [
    configModule('shipments', baseEnv, jwtEnv, dbEnv, kafkaEnv),
    loggerModule('shipments'),
    typeOrmModule(shipmentsDb),
    MessagingModule.forRoot({ clientId: 'shipments', outbox: true }),
    AuthCoreModule,
    HealthModule.forRoot({ database: true }),
    ShipmentsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class ShipmentsAppModule {}
