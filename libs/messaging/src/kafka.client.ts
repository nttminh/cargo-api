import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { Admin, Kafka, KafkaConfig, logLevel, SASLOptions } from 'kafkajs';
import { COMPACTED_TOPICS, Topic } from './contracts';

const bool = (v: string | undefined) => ['true', '1', 'yes'].includes((v ?? '').toLowerCase());

/** kafkajs connection settings from KAFKA_* environment variables. */
export function kafkaConfigFromEnv(clientId: string): KafkaConfig {
  const mechanism = process.env.KAFKA_SASL_MECHANISM as SASLOptions['mechanism'] | undefined;
  return {
    clientId: process.env.KAFKA_CLIENT_ID ?? clientId,
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',').map((b) => b.trim()),
    ssl: bool(process.env.KAFKA_SSL),
    sasl: mechanism
      ? ({
          mechanism,
          username: process.env.KAFKA_SASL_USERNAME ?? '',
          password: process.env.KAFKA_SASL_PASSWORD ?? '',
        } as SASLOptions)
      : undefined,
    connectionTimeout: 5000,
    retry: { initialRetryTime: 300, retries: 8 },
    logLevel: logLevel.WARN,
    logCreator: () => {
      const logger = new Logger('Kafka');
      return ({ level, log }) => {
        const { message, ...extra } = log;
        const line = `${message} ${JSON.stringify(extra)}`;
        if (level === logLevel.ERROR) logger.error(line);
        else if (level === logLevel.WARN) logger.warn(line);
        else logger.debug(line);
      };
    },
  };
}

/** One kafkajs client per process, shared by the outbox relay and the consumers. */
export class KafkaClient implements OnApplicationShutdown {
  readonly kafka: Kafka;
  private admin?: Admin;
  private readonly ensured = new Set<string>();

  constructor(readonly clientId: string) {
    this.kafka = new Kafka(kafkaConfigFromEnv(clientId));
  }

  /** Creates missing topics (idempotent). Master data topics are compacted. */
  async ensureTopics(topics: readonly Topic[]): Promise<void> {
    const missing = topics.filter((t) => !this.ensured.has(t));
    if (!missing.length) return;
    if (!this.admin) {
      this.admin = this.kafka.admin();
      await this.admin.connect();
    }
    const existing = new Set(await this.admin.listTopics());
    const toCreate = missing.filter((t) => !existing.has(t));
    if (toCreate.length) {
      await this.admin.createTopics({
        waitForLeaders: true,
        topics: toCreate.map((topic) => ({
          topic,
          numPartitions: parseInt(process.env.KAFKA_TOPIC_PARTITIONS ?? '3', 10),
          replicationFactor: parseInt(process.env.KAFKA_TOPIC_REPLICATION_FACTOR ?? '1', 10),
          configEntries: COMPACTED_TOPICS.includes(topic)
            ? [{ name: 'cleanup.policy', value: 'compact' }]
            : [{ name: 'retention.ms', value: String(30 * 24 * 3600 * 1000) }],
        })),
      });
    }
    missing.forEach((t) => this.ensured.add(t));
  }

  async onApplicationShutdown() {
    await this.admin?.disconnect().catch(() => undefined);
  }
}
