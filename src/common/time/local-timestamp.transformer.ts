import { ValueTransformer } from 'typeorm';

/**
 * Maps a Postgres `timestamp` (no time zone) column to a "YYYY-MM-DDTHH:mm:ss" string, so a
 * local wall-clock time never passes through the server's time zone.
 *
 * TypeORM and the pg driver always convert these columns through JavaScript Date using the process
 * time zone. With the process in UTC (see force-utc.ts) a Date's UTC fields are exactly the stored
 * wall-clock fields, which is what both directions below rely on.
 */
export const localTimestampTransformer: ValueTransformer = {
  to(value: string | null | undefined): Date | null | undefined {
    if (value == null) return value;
    assertUtcProcess();
    return new Date(`${value}Z`);
  },
  from(value: Date | null): string | null {
    if (value == null) return null;
    assertUtcProcess();
    return value.toISOString().slice(0, 19);
  },
};

function assertUtcProcess() {
  const year = new Date().getUTCFullYear();
  const winter = new Date(Date.UTC(year, 0, 1)).getTimezoneOffset();
  const summer = new Date(Date.UTC(year, 6, 1)).getTimezoneOffset();
  if (winter !== 0 || summer !== 0) {
    throw new Error('Process time zone must be UTC: import common/time/force-utc first');
  }
}
