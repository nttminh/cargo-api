import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { JwtStrategy } from './jwt.strategy';

/**
 * Every service verifies the access token itself (shared secret, signed by identity) and
 * enforces roles, so a request that reaches a service without passing the gateway is still
 * authenticated. Routes are protected by default; @Public() opts out.
 */
@Module({
  imports: [PassportModule],
  providers: [
    JwtStrategy,
    // Order matters: authenticate -> authorise.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthCoreModule {}
