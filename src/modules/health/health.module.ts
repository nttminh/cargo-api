import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  // No in-app shutdown delay: in Kubernetes the preStop hook already waits for endpoints to
  // drain before SIGTERM arrives, so the app can close immediately once it gets the signal.
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
