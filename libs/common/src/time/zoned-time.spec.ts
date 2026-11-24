import { fromInstant, fromLocal, normalizeLocal, recomputeUtc, ZonedTimeError } from './zoned-time';

describe('zoned time', () => {
  describe('fromLocal', () => {
    it('converts a port local time to UTC', () => {
      const t = fromLocal('2026-12-01T14:30', 'Asia/Ho_Chi_Minh');
      expect(t).toEqual({
        local: '2026-12-01T14:30:00',
        timeZone: 'Asia/Ho_Chi_Minh',
        utc: new Date('2026-12-01T07:30:00Z'),
      });
    });

    it('applies daylight saving time for the date, not today', () => {
      // Los Angeles is UTC-7 in July (PDT) and UTC-8 in December (PST).
      expect(fromLocal('2026-07-01T09:00', 'America/Los_Angeles').utc.toISOString()).toBe(
        '2026-07-01T16:00:00.000Z',
      );
      expect(fromLocal('2026-12-01T09:00', 'America/Los_Angeles').utc.toISOString()).toBe(
        '2026-12-01T17:00:00.000Z',
      );
    });

    it('rejects a time skipped by the spring-forward change', () => {
      expect(() => fromLocal('2027-03-14T02:30', 'America/Los_Angeles')).toThrow(/does not exist/);
    });

    it('rejects a time repeated by the fall-back change', () => {
      expect(() => fromLocal('2026-11-01T01:30', 'America/Los_Angeles')).toThrow(/happens twice/);
    });

    it('rejects unknown zones and malformed input', () => {
      expect(() => fromLocal('2026-12-01T14:30', 'Mars/Olympus')).toThrow(ZonedTimeError);
      expect(() => fromLocal('2026-12-01T14:30Z', 'UTC')).toThrow(ZonedTimeError);
      expect(() => fromLocal('2026-02-30T10:00', 'UTC')).toThrow(ZonedTimeError);
    });
  });

  describe('fromInstant', () => {
    it('derives the local time at the port from an instant with an offset', () => {
      expect(fromInstant('2026-12-01T20:00:00Z', 'America/Los_Angeles')).toEqual({
        local: '2026-12-01T12:00:00',
        timeZone: 'America/Los_Angeles',
        utc: new Date('2026-12-01T20:00:00Z'),
      });
      expect(fromInstant('2026-12-01T14:30:00+07:00', 'Asia/Ho_Chi_Minh').local).toBe(
        '2026-12-01T14:30:00',
      );
    });

    it('resolves the repeated fall-back hour when the offset is explicit', () => {
      expect(
        fromInstant('2026-11-01T01:30:00-07:00', 'America/Los_Angeles').utc.toISOString(),
      ).toBe('2026-11-01T08:30:00.000Z');
      expect(
        fromInstant('2026-11-01T01:30:00-08:00', 'America/Los_Angeles').utc.toISOString(),
      ).toBe('2026-11-01T09:30:00.000Z');
    });

    it('rejects strings without an offset', () => {
      expect(() => fromInstant('2026-12-01T20:00:00', 'UTC')).toThrow(/UTC offset/);
    });
  });

  it('normalizes and recomputes', () => {
    expect(normalizeLocal('2026-12-01T14:30')).toBe('2026-12-01T14:30:00');
    expect(recomputeUtc('2026-12-01T14:30:00', 'Asia/Tokyo').toISOString()).toBe(
      '2026-12-01T05:30:00.000Z',
    );
  });
});
