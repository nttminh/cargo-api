import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import {
  AllExceptionsFilter,
  baseEnv,
  configModule,
  gatewayEnv,
  HealthModule,
  loggerModule,
} from '@cargo/common';
import { EdgeAuthGuard } from './proxy/edge-auth.guard';
import { ProxyController } from './proxy/proxy.controller';
import { ProxyService } from './proxy/proxy.service';

/**
 * API gateway: the only public entry point. Owns CORS, rate limiting, request ids, the merged
 * API reference and an early token check, then streams each request to the service that owns
 * the resource. Stateless: no database, no Kafka.
 */
@Module({
  imports: [
    configModule('gateway', baseEnv, gatewayEnv, { JWT_SECRET: Joi.string().min(32).required() }),
    loggerModule('gateway'),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('jwt.secret') }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('throttle.ttl', 60000),
          limit: config.get<number>('throttle.limit', 120),
        },
      ],
    }),
    HealthModule.forRoot({ database: false }),
  ],
  controllers: [ProxyController],
  providers: [
    ProxyService,
    // Order matters: rate-limit -> reject bad tokens early.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: EdgeAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class GatewayModule {}
