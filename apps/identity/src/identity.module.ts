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
import { identityDb } from './database/entities';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

/** Identity service: users, login and access tokens. */
@Module({
  imports: [
    configModule('identity', baseEnv, jwtEnv, dbEnv, kafkaEnv),
    loggerModule('identity'),
    typeOrmModule(identityDb),
    MessagingModule.forRoot({ clientId: 'identity' }),
    AuthCoreModule,
    HealthModule.forRoot({ database: true }),
    AuthModule,
    UsersModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class IdentityModule {}
