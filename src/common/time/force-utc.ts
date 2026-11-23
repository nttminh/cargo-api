/**
 * Run the process in UTC, whatever the host is set to.
 *
 * The Postgres driver converts `timestamp` (no time zone) values through JavaScript Date in the
 * process time zone. In UTC that round trip is exact; in a zone with DST, wall-clock times inside
 * the DST gap would shift. Import this module first in every entry point (app, migrations, seed,
 * scripts). Node applies a runtime change to process.env.TZ immediately.
 */
process.env.TZ = 'UTC';

export {};
