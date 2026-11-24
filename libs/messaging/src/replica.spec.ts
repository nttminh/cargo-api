import { Repository } from 'typeorm';
import { ReplicaEntity, upsertReplica } from './replica';

interface Ref extends ReplicaEntity {
  code: string;
  isActive: boolean;
}

/** Minimal stand-in for a TypeORM repository: metadata plus a recorded query(). */
function fakeRepo(returned: unknown[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const col = (propertyName: string, databaseName: string, extra = {}) => ({
    propertyName,
    databaseName,
    isPrimary: false,
    isUpdateDate: false,
    ...extra,
  });
  const repo = {
    metadata: {
      tableName: 'location_refs',
      columns: [
        col('id', 'id', { isPrimary: true }),
        col('sourceVersion', 'source_version'),
        col('syncedAt', 'synced_at', { isUpdateDate: true }),
        col('code', 'code'),
        col('isActive', 'is_active'),
      ],
    },
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return returned;
    },
  } as unknown as Repository<Ref>;
  return { repo, calls };
}

describe('upsertReplica', () => {
  const row = { id: 'a1', sourceVersion: 3, code: 'SGN', isActive: true };

  it('inserts or updates, but only with a newer source version', async () => {
    const { repo, calls } = fakeRepo([{ id: 'a1' }]);
    await expect(upsertReplica(repo, row)).resolves.toBe(true);

    const [{ sql, params }] = calls;
    const flat = sql.replace(/\s+/g, ' ');
    expect(flat).toContain(
      'INSERT INTO "location_refs" ("id", "source_version", "code", "is_active", "synced_at")',
    );
    expect(flat).toContain('VALUES ($1, $2, $3, $4, now())');
    expect(flat).toContain(
      'ON CONFLICT ("id") DO UPDATE SET "source_version" = EXCLUDED."source_version", ' +
        '"code" = EXCLUDED."code", "is_active" = EXCLUDED."is_active", "synced_at" = now()',
    );
    expect(flat).toContain('WHERE "location_refs"."source_version" < EXCLUDED."source_version"');
    expect(params).toEqual(['a1', 3, 'SGN', true]);
  });

  it('reports a stale or duplicate snapshot as not written', async () => {
    const { repo } = fakeRepo([]);
    await expect(upsertReplica(repo, row)).resolves.toBe(false);
  });
});
