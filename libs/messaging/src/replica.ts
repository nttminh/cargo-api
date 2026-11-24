import { Exclude } from 'class-transformer';
import { Column, ObjectLiteral, PrimaryColumn, Repository, UpdateDateColumn } from 'typeorm';

/**
 * Local, read-only copy of a record owned by another service, kept up to date from its Kafka
 * topic. Same id as the original. Never written by this service's API.
 */
export abstract class ReplicaEntity {
  @PrimaryColumn('uuid')
  id!: string;

  /** Version of the source record this row reflects. */
  @Exclude()
  @Column({ name: 'source_version', type: 'int' })
  sourceVersion!: number;

  @Exclude()
  @UpdateDateColumn({ name: 'synced_at', type: 'timestamptz' })
  syncedAt!: Date;
}

/**
 * Inserts or updates a replica row, but only if the incoming version is newer than the stored
 * one. Makes consumers idempotent: duplicates and stale (reordered) snapshots change nothing.
 * Returns true if the row was written.
 */
export async function upsertReplica<T extends ReplicaEntity & ObjectLiteral>(
  repo: Repository<T>,
  row: Omit<T, 'syncedAt'>,
): Promise<boolean> {
  const meta = repo.metadata;
  const columns = meta.columns.filter(
    (c) => !c.isUpdateDate && (row as ObjectLiteral)[c.propertyName] !== undefined,
  );
  const names = columns.map((c) => `"${c.databaseName}"`);
  const values = columns.map((c) => (row as ObjectLiteral)[c.propertyName]);
  const updates = columns
    .filter((c) => !c.isPrimary)
    .map((c) => `"${c.databaseName}" = EXCLUDED."${c.databaseName}"`);
  const table = `"${meta.tableName}"`;

  const result: unknown[] = await repo.query(
    `INSERT INTO ${table} (${names.join(', ')}, "synced_at")
     VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}, now())
     ON CONFLICT ("id") DO UPDATE SET ${updates.join(', ')}, "synced_at" = now()
     WHERE ${table}."source_version" < EXCLUDED."source_version"
     RETURNING "id"`,
    values,
  );
  return result.length > 0;
}
