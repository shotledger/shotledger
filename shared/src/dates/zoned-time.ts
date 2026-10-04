// Wall-clock time in a named IANA zone (not the device's) -> UTC instant, for
// sources that send a naive local timestamp, such as Webshooter's API.

interface NaiveDateTimeParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseNaive(localDateTime: string): NaiveDateTimeParts {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u.exec(localDateTime);
  if (!match) {
    throw new RangeError(`Expected "YYYY-MM-DD HH:mm:ss", got ${JSON.stringify(localDateTime)}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
}

/** IANA zone offset, in minutes east of UTC, for the instant `ms`. */
function offsetMinutesAt(timeZone: string, ms: number): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - ms) / 60000;
}

/**
 * Converts a naive `"YYYY-MM-DD HH:mm:ss"` local timestamp (Webshooter's own
 * format, no offset) to a UTC ISO string, without a date/tz library
 * dependency (Webshooter spec §4.4). Fixed-point technique: guess the
 * instant as if the wall-clock components were UTC, sample the zone's actual
 * offset at that instant, correct, then resample once more — two samples
 * always converge here because Europe/Stockholm's offset only ever takes one
 * of two values (+1h/+2h) and the correction is small enough never to cross a
 * second DST boundary.
 */
export function localToUtcIso(localDateTime: string, timeZone = 'Europe/Stockholm'): string {
  const parts = parseNaive(localDateTime);
  const naiveUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let candidateMs = naiveUtcMs;
  for (let i = 0; i < 2; i += 1) {
    const offsetMinutes = offsetMinutesAt(timeZone, candidateMs);
    candidateMs = naiveUtcMs - offsetMinutes * 60000;
  }
  return new Date(candidateMs).toISOString();
}
