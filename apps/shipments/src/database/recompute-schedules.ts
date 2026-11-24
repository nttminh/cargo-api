/**
 * Re-derives etd_utc / eta_utc for upcoming schedules from their local time + IANA zone.
 *
 * Needed after a time zone rule change ships (a new tzdata in Node/ICU, e.g. a country moves or
 * drops daylight saving time): the agreed local time stays the same, its UTC instant moves.
 * Safe to run any time; it only writes rows whose UTC value actually changes.
 *   dev:  npm run schedules:recompute
 *   prod: node dist/apps/shipments/apps/shipments/src/database/recompute-schedules.js   (CronJob)
 */
import dataSource from './data-source';
import { recomputeUtc } from '@cargo/common';

const LOCAL_TEXT = `'YYYY-MM-DD"T"HH24:MI:SS'`;

async function recompute(field: 'etd' | 'eta'): Promise<number> {
  // Past schedules are history; only upcoming ones (with a day of margin) can still move.
  const rows: { id: string; local: string; tz: string; utc: Date }[] = await dataSource.query(`
    SELECT "id",
           to_char("${field}_local", ${LOCAL_TEXT}) AS "local",
           "${field}_tz" AS "tz",
           "${field}_utc" AS "utc"
      FROM "shipments"
     WHERE "${field}_local" IS NOT NULL
       AND "${field}_utc" >= now() - interval '1 day'
  `);

  let changed = 0;
  for (const row of rows) {
    const utc = recomputeUtc(row.local, row.tz);
    if (utc.getTime() === new Date(row.utc).getTime()) continue;
    await dataSource.query(`UPDATE "shipments" SET "${field}_utc" = $1 WHERE "id" = $2`, [
      utc,
      row.id,
    ]);
    changed++;
    console.log(`${field} ${row.id}: ${row.local} ${row.tz} -> ${utc.toISOString()}`);
  }
  return changed;
}

async function main() {
  await dataSource.initialize();
  try {
    const etd = await recompute('etd');
    const eta = await recompute('eta');
    console.log(`Schedules recomputed: ${etd} ETD and ${eta} ETA values changed`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
