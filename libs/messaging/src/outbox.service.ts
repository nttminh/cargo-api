import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { EventEnvelope, EventType, Topic } from './contracts';
import { OutboxMessage } from './outbox.entity';

@Injectable()
export class OutboxService {
  /**
   * Records an event inside the caller's transaction. Pass the EntityManager of the transaction
   * that writes the change, so both commit together.
   */
  async add<T>(em: EntityManager, topic: Topic, key: string, type: EventType, data: T) {
    const envelope: EventEnvelope<T> = {
      id: randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      data,
    };
    await em.save(em.create(OutboxMessage, { topic, key, envelope: envelope as EventEnvelope }));
    return envelope;
  }
}
