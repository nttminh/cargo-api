import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsOptional, IsTimeZone, Matches, ValidateIf } from 'class-validator';
import { INSTANT_RE, LOCAL_DATE_TIME_RE } from './zoned-time';

const INSTANT_MESSAGE =
  '$property must be an ISO 8601 date-time with a UTC offset, e.g. 2026-12-01T07:30:00Z';

/**
 * Optional instant (a moment in time). Only accepts strings with an explicit offset, so a time
 * sent without one is rejected instead of being read in the server's time zone.
 */
export function IsOptionalInstant(description?: string) {
  return applyDecorators(
    ApiPropertyOptional({
      type: String,
      format: 'date-time',
      example: '2026-12-01T07:30:00Z',
      description,
    }),
    IsOptional(),
    Transform(({ value }) =>
      typeof value === 'string' && INSTANT_RE.test(value) ? new Date(value) : value,
    ),
    IsDate({ message: INSTANT_MESSAGE }),
  );
}

/**
 * A planned local time at a port (ETD at origin, ETA at destination). Send either:
 *   { "local": "2026-12-01T14:30" }                 local time at the port (zone from the port)
 *   { "local": "2026-12-01T14:30", "timeZone": "Asia/Ho_Chi_Minh" }
 *   { "at": "2026-12-01T07:30:00Z" }                an instant, converted to the port's local time
 */
export class ScheduleTimeDto {
  @ApiPropertyOptional({
    example: '2026-12-01T14:30',
    description: 'Local date-time at the port, without offset. Use either local or at.',
  })
  @ValidateIf((o: ScheduleTimeDto) => o.at === undefined)
  @Matches(LOCAL_DATE_TIME_RE, {
    message: '$property must be a local date-time like 2026-12-01T14:30 (no offset)',
  })
  local?: string;

  @ApiPropertyOptional({
    example: 'Asia/Ho_Chi_Minh',
    description: "IANA time zone for local. Defaults to the port's time zone.",
  })
  @IsOptional()
  @IsTimeZone()
  timeZone?: string;

  @ApiPropertyOptional({
    example: '2026-12-01T07:30:00Z',
    description: 'Instant with a UTC offset. Use either local or at.',
  })
  @ValidateIf((o: ScheduleTimeDto) => o.local === undefined)
  @Matches(INSTANT_RE, { message: INSTANT_MESSAGE })
  at?: string;
}
