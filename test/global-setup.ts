/**
 * Jest gives each test file its own copy of process.env, so src/common/time/force-utc.ts can't
 * change the time zone from inside a test. Global setup runs in the real process first.
 */
export default function globalSetup() {
  process.env.TZ = 'UTC';
}
