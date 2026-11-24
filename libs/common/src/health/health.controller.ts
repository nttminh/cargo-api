import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../decorators';

const live = () => ({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });

/**
 * Kubernetes probes for a service with a database (served outside the API prefix):
 *  - GET /health/live  -> liveness: process is up (no external deps, so a DB outage doesn't restart pods)
 *  - GET /health/ready -> readiness: own DB reachable; pod is removed from Service endpoints if not
 * Kafka is deliberately not checked: writes go to the outbox table and are published once Kafka
 * is back, so the HTTP API stays available while the broker is down.
 */
@ApiExcludeController()
@Public()
@Controller('health')
export class DbHealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get('live')
  live() {
    return live();
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 3000 })]);
  }
}

/** Probes for a stateless service (the gateway): ready as soon as it is up. */
@ApiExcludeController()
@Public()
@Controller('health')
export class StatelessHealthController {
  @Get('live')
  live() {
    return live();
  }

  @Get('ready')
  ready() {
    return { status: 'ok' };
  }
}
