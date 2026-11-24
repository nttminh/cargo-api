import { Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, Topic } from './contracts';
import { KafkaClient } from './kafka.client';

export type EventHandler = (event: EventEnvelope, payload: EachMessagePayload) => Promise<void>;

/**
 * Base class for a service's Kafka consumer group.
 *
 * - Starts in the background: the HTTP API comes up even while Kafka is unreachable, and the
 *   consumer keeps retrying.
 * - At-least-once: the offset is committed only after the handler succeeded. A handler that
 *   throws (for example while the database is down) makes kafkajs retry the same message.
 * - A message that is not valid JSON can never succeed, so it is logged and skipped instead of
 *   blocking its partition.
 * - Reads from the beginning when the group is new, so a fresh replica receives all current
 *   state from the compacted topics.
 */
export abstract class EventConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  protected readonly logger = new Logger(this.constructor.name);
  protected abstract readonly groupId: string;
  protected abstract readonly handlers: Partial<Record<Topic, EventHandler>>;
  private consumer?: Consumer;
  private stopped = false;
  private retryTimer?: NodeJS.Timeout;

  constructor(protected readonly kafka: KafkaClient) {}

  onApplicationBootstrap() {
    if (process.env.KAFKA_CONSUMERS_ENABLED === 'false') {
      this.logger.warn('Kafka consumers disabled (KAFKA_CONSUMERS_ENABLED=false)');
      return;
    }
    void this.start(1);
  }

  async onApplicationShutdown() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    await this.consumer?.disconnect().catch(() => undefined);
  }

  private async start(attempt: number): Promise<void> {
    if (this.stopped) return;
    const topics = Object.keys(this.handlers) as Topic[];
    try {
      await this.kafka.ensureTopics(topics);
      const consumer = this.kafka.kafka.consumer({
        groupId: this.groupId,
        retry: { retries: 10, initialRetryTime: 500 },
      });
      // After kafkajs gives up (crash without restart), start over with a fresh consumer.
      consumer.on(consumer.events.CRASH, ({ payload }) => {
        if (!payload.restart) {
          this.logger.error(`Consumer crashed: ${payload.error?.message}`);
          void consumer.disconnect().finally(() => this.retryLater(1));
        }
      });
      await consumer.connect();
      await consumer.subscribe({ topics, fromBeginning: true });
      await consumer.run({ eachMessage: (p) => this.dispatch(p) });
      this.consumer = consumer;
      this.logger.log(`Consuming ${topics.join(', ')} as group ${this.groupId}`);
    } catch (err) {
      this.logger.warn(`Kafka consumer start failed: ${(err as Error).message}`);
      this.retryLater(attempt + 1);
    }
  }

  private retryLater(attempt: number) {
    if (this.stopped) return;
    const delay = Math.min(1000 * 2 ** attempt, 30_000);
    this.retryTimer = setTimeout(() => void this.start(attempt), delay);
  }

  private async dispatch(payload: EachMessagePayload) {
    const { topic, partition, message } = payload;
    const handler = this.handlers[topic as Topic];
    if (!handler || !message.value) return;

    let event: EventEnvelope;
    try {
      event = JSON.parse(message.value.toString('utf8'));
    } catch {
      this.logger.error(`Skipping malformed message ${topic}[${partition}]@${message.offset}`);
      return;
    }
    await handler(event, payload);
  }
}
