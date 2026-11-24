import { DataSource } from 'typeorm';

/**
 * Concurrency-safe migration run, used by each service's migrate script (a Kubernetes
 * initContainer). Several pods may start at once (rollout, HPA scale-up); a Postgres advisory
 * lock makes exactly one of them apply pending migrations, the others wait and find nothing to do.
 */
export async function runMigrationsLocked(dataSource: DataSource, lockKey: number) {
  await dataSource.initialize();
  const lockRunner = dataSource.createQueryRunner();
  await lockRunner.connect();
  try {
    console.log('Acquiring migration lock...');
    await lockRunner.query('SELECT pg_advisory_lock($1)', [lockKey]);
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(
      applied.length
        ? `Applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ')}`
        : 'Database schema is up to date',
    );
  } finally {
    await lockRunner.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => undefined);
    await lockRunner.release();
    await dataSource.destroy();
  }
}

/** Runs a script's main() and exits non-zero on failure. */
export const runScript = (name: string, main: () => Promise<void>) =>
  main().catch((err) => {
    console.error(`${name} failed:`, err);
    process.exit(1);
  });
