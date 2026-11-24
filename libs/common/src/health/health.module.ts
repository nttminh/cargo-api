import { DynamicModule, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DbHealthController, StatelessHealthController } from './health.controller';

// No in-app shutdown delay: in Kubernetes the preStop hook already waits for endpoints to
// drain before SIGTERM arrives, so the app can close immediately once it gets the signal.
@Module({})
export class HealthModule {
  static forRoot(o: { database: boolean }): DynamicModule {
    return {
      module: HealthModule,
      imports: [TerminusModule],
      controllers: [o.database ? DbHealthController : StatelessHealthController],
    };
  }
}
