import { DynamicModule, Global, Module } from '@nestjs/common';
import { KafkaClient } from './kafka.client';
import { OutboxRelay } from './outbox.relay';
import { OutboxService } from './outbox.service';

@Global()
@Module({})
export class MessagingModule {
  /**
   * Kafka client for the service. With `outbox: true` the service publishes events: it gets
   * OutboxService (to record events in its transactions) and the relay that sends them.
   * The service must also list OutboxMessage in its entities and migrations.
   */
  static forRoot(o: { clientId: string; outbox?: boolean }): DynamicModule {
    const kafka = { provide: KafkaClient, useFactory: () => new KafkaClient(o.clientId) };
    const providers = o.outbox ? [kafka, OutboxService, OutboxRelay] : [kafka];
    return {
      module: MessagingModule,
      providers,
      exports: o.outbox ? [KafkaClient, OutboxService] : [KafkaClient],
    };
  }
}
