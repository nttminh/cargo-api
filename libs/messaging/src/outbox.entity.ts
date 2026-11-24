import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { EventEnvelope } from './contracts';

/**
 * Transactional outbox: an event is written in the same database transaction as the change it
 * describes, then published to Kafka by the relay. The change and its event commit together or
 * not at all, and nothing is lost while Kafka is unavailable.
 */
@Entity('outbox')
@Index('ix_outbox_unpublished', ['seq'], { where: '"published_at" IS NULL' })
export class OutboxMessage {
  /** Publish order. bigint comes back from pg as a string. */
  @PrimaryGeneratedColumn('increment', { type: 'bigint', name: 'seq' })
  seq!: string;

  @Column({ type: 'varchar', length: 200 })
  topic!: string;

  /** Kafka message key: all events of one entity go to the same partition, in order. */
  @Column({ type: 'varchar', length: 200 })
  key!: string;

  @Column({ type: 'jsonb' })
  envelope!: EventEnvelope;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
