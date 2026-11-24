import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CustomerSnapshot,
  EventConsumer,
  EventEnvelope,
  KafkaClient,
  Topics,
  upsertReplica,
} from '@cargo/messaging';
import { CustomerRef } from './customer-ref.entity';

@Injectable()
export class CustomersConsumer extends EventConsumer {
  protected readonly groupId = 'identity';
  protected readonly handlers = {
    [Topics.customers]: async (e: EventEnvelope) => {
      const c = e.data as CustomerSnapshot;
      await upsertReplica(this.refs, {
        id: c.id,
        sourceVersion: c.version,
        code: c.code,
        isActive: c.isActive,
      });
    },
  };

  constructor(
    kafka: KafkaClient,
    @InjectRepository(CustomerRef) private readonly refs: Repository<CustomerRef>,
  ) {
    super(kafka);
  }
}
