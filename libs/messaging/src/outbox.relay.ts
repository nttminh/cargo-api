import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Partitioners, Producer } from 'kafkajs';
import { DataSource } from 'typeorm';
import { Topic } from './contracts';
import { KafkaClient } from './kafka.client';

const BATCH_SIZE = 200;
/** Only one relay per database publishes at a time, so events leave in commit order. */
const RELAY_LOCK_KEY = 7_265_302;
const MAX_BACKOFF_MS = 30_000;
const RETENTION_DAYS = 7;

interface PendingRow {
  seq: string;
  topic: string;
  key: string;
  envelope: { type: string };
}

/**
 * Publishes outbox rows to Kafka, oldest first, then marks them published.
 *
 * Delivery is at-least-once: if the process dies after Kafka acknowledged a batch but before
 * the rows are marked, the batch is sent again. Consumers are idempotent (version checks).
 * Every replica of the service runs a relay; a transaction-scoped advisory lock lets exactly one
 * of them work at any moment, which keeps the per-key order.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private producer?: Producer;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;
  private failures = 0;
  private lastCleanup = 0;
  private readonly pollMs = parseInt(process.env.OUTBOX_POLL_MS ?? '250', 10);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly kafka: KafkaClient,
  ) {}

  onApplicationBootstrap() {
    if (process.env.OUTBOX_RELAY_ENABLED === 'false') {
      this.logger.warn('Outbox relay disabled (OUTBOX_RELAY_ENABLED=false)');
      return;
    }
    this.schedule(0);
  }

  async onApplicationShutdown() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running?.catch(() => undefined);
    await this.producer?.disconnect().catch(() => undefined);
  }

  private schedule(delayMs: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick().finally(() => (this.running = undefined));
    }, delayMs);
  }

  private async tick() {
    let next = this.pollMs;
    try {
      const sent = await this.publishBatch();
      if (this.failures) this.logger.log('Outbox relay recovered');
      this.failures = 0;
      if (sent === BATCH_SIZE) next = 0; // more waiting: keep draining
      await this.cleanup();
    } catch (err) {
      this.failures++;
      next = Math.min(this.pollMs * 2 ** this.failures, MAX_BACKOFF_MS);
      // First failure and then every 10th, so an outage doesn't flood the logs.
      if (this.failures === 1 || this.failures % 10 === 0) {
        this.logger.warn(
          `Outbox publish failed (${this.failures}x), retrying in ${next} ms: ${(err as Error).message}`,
        );
      }
      await this.producer?.disconnect().catch(() => undefined);
      this.producer = undefined;
    }
    this.schedule(next);
  }

  private async publishBatch(): Promise<number> {
    return this.dataSource.transaction(async (em) => {
      const [{ locked }] = await em.query(`SELECT pg_try_advisory_xact_lock($1) AS "locked"`, [
        RELAY_LOCK_KEY,
      ]);
      if (!locked) return 0;

      const rows: PendingRow[] = await em.query(
        `SELECT "seq", "topic", "key", "envelope" FROM "outbox"
          WHERE "published_at" IS NULL ORDER BY "seq" LIMIT $1`,
        [BATCH_SIZE],
      );
      if (!rows.length) return 0;

      const producer = await this.getProducer([...new Set(rows.map((r) => r.topic as Topic))]);
      const byTopic = new Map<string, PendingRow[]>();
      for (const r of rows) byTopic.set(r.topic, [...(byTopic.get(r.topic) ?? []), r]);
      await producer.sendBatch({
        acks: -1,
        topicMessages: [...byTopic].map(([topic, msgs]) => ({
          topic,
          messages: msgs.map((r) => ({
            key: r.key,
            value: JSON.stringify(r.envelope),
            headers: { 'event-type': r.envelope.type },
          })),
        })),
      });

      await em.query(`UPDATE "outbox" SET "published_at" = now() WHERE "seq" = ANY($1::bigint[])`, [
        rows.map((r) => r.seq),
      ]);
      return rows.length;
    });
  }

  private async getProducer(topics: Topic[]): Promise<Producer> {
    await this.kafka.ensureTopics(topics);
    if (!this.producer) {
      const producer = this.kafka.kafka.producer({
        allowAutoTopicCreation: false,
        // Explicit (and the kafkajs 2 default): murmur2 on the key, same as the Java client.
        createPartitioner: Partitioners.DefaultPartitioner,
        // One request in flight per broker keeps the order of retried batches.
        maxInFlightRequests: 1,
      });
      await producer.connect();
      this.producer = producer;
    }
    return this.producer;
  }

  /** Published rows are only kept for a while, for troubleshooting. */
  private async cleanup() {
    if (Date.now() - this.lastCleanup < 3600_000) return;
    this.lastCleanup = Date.now();
    await this.dataSource.query(
      `DELETE FROM "outbox" WHERE "published_at" < now() - make_interval(days => $1)`,
      [RETENTION_DAYS],
    );
  }
}
