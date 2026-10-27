/**
 * Concurrency-safe migration runner, used as a Kubernetes initContainer:
 *   node dist/database/migrate.js
 *
 * Several pods may start at once (rollout, HPA scale-up). A Postgres advisory lock makes
 * exactly one of them apply pending migrations; the others wait, then find nothing to do.
 */
import dataSource from './data-source';

const LOCK_KEY = 7_265_301; // arbitrary app-specific constant

async function main() {
  await dataSource.initialize();
  const lockRunner = dataSource.createQueryRunner();
  await lockRunner.connect();
  try {
    console.log('Acquiring migration lock...');
    await lockRunner.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    console.log(
      applied.length
        ? `Applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ')}`
        : 'Database schema is up to date',
    );
  } finally {
    await lockRunner.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await lockRunner.release();
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
