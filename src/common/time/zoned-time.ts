import { DateTime, IANAZone } from 'luxon';

/**
 * A planned local time at a place (e.g. ETD at the origin port): the agreed wall-clock time, the
 * IANA zone it belongs to, and the UTC instant derived from the two. The local time and zone are
 * the source of truth; the UTC instant is recomputed if time zone rules change.
 */
export interface ZonedTime {
  /** Wall-clock time, "YYYY-MM-DDTHH:mm:ss", no offset */
  local: string;
  /** IANA time zone, e.g. "Asia/Ho_Chi_Minh" */
  timeZone: string;
  utc: Date;
}

/** Local date-time without offset: 2026-12-01T14:30 or 2026-12-01T14:30:00 */
export const LOCAL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** Date-time with an explicit UTC offset: 2026-12-01T07:30:00Z or 2026-12-01T14:30:00+07:00 */
export const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

/** A rule violation the caller can fix (bad input), as opposed to a programming error. */
export class ZonedTimeError extends Error {}

export const isValidTimeZone = (zone: string): boolean => IANAZone.isValidZone(zone);

function assertZone(zone: string) {
  if (!isValidTimeZone(zone)) throw new ZonedTimeError(`Unknown time zone "${zone}"`);
}

/** Normalizes "2026-12-01T14:30" to "2026-12-01T14:30:00". */
export function normalizeLocal(local: string): string {
  if (!LOCAL_DATE_TIME_RE.test(local)) {
    throw new ZonedTimeError(`"${local}" is not a local date-time like 2026-12-01T14:30`);
  }
  return local.length === 16 ? `${local}:00` : local;
}

/**
 * Local wall-clock time in a zone -> ZonedTime.
 * Rejects times that don't exist (skipped by a DST change) or happen twice (repeated by one),
 * instead of guessing; the caller can send an instant with an explicit offset in that case.
 */
export function fromLocal(local: string, timeZone: string): ZonedTime {
  assertZone(timeZone);
  const wanted = normalizeLocal(local);
  const dt = DateTime.fromISO(wanted, { zone: timeZone });
  if (!dt.isValid) throw new ZonedTimeError(`"${local}" is not a valid date-time`);

  if (dt.toFormat(LOCAL_FORMAT) !== wanted) {
    throw new ZonedTimeError(
      `${local} does not exist in ${timeZone} (clocks skip forward for daylight saving time)`,
    );
  }
  if (dt.getPossibleOffsets().length > 1) {
    throw new ZonedTimeError(
      `${local} happens twice in ${timeZone} (clocks fall back for daylight saving time). ` +
        'Send the time with an explicit offset instead.',
    );
  }
  return { local: wanted, timeZone, utc: dt.toUTC().toJSDate() };
}

/** Instant (Date, or ISO string with an explicit offset) -> local time in the given zone. */
export function fromInstant(at: Date | string, timeZone: string): ZonedTime {
  assertZone(timeZone);
  if (typeof at === 'string' && !INSTANT_RE.test(at)) {
    throw new ZonedTimeError(`"${at}" must include a UTC offset, e.g. 2026-12-01T07:30:00Z`);
  }
  const dt =
    typeof at === 'string' ? DateTime.fromISO(at, { setZone: true }) : DateTime.fromJSDate(at);
  if (!dt.isValid) throw new ZonedTimeError(`"${String(at)}" is not a valid date-time`);
  const utc = dt.toUTC().startOf('second');
  return {
    local: utc.setZone(timeZone).toFormat(LOCAL_FORMAT),
    timeZone,
    utc: utc.toJSDate(),
  };
}

/** Re-derives the UTC instant from the stored local time and zone (after tz rule changes). */
export function recomputeUtc(local: string, timeZone: string): Date {
  assertZone(timeZone);
  return DateTime.fromISO(normalizeLocal(local), { zone: timeZone }).toUTC().toJSDate();
}
