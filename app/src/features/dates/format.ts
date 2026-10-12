// The one place a date becomes text on screen (#746, maintainer's ruling
// 2026-10-12: use the locale). Phone and web both call it with the locale from
// `displayLocale`. Pure — no react-native import — so `web/` imports it
// directly. Stored values never pass through here.
//
// An abbreviated month loses its trailing period ("14 aug 2026", not
// "14 aug. 2026"; maintainer, 2026-09-03).

type Instant = string | number | Date;

/**
 * The BCP 47 tag dates are shown in: the language the app is showing plus
 * the device's or browser's region, so English on a Swedish phone reads
 * "14 Aug 2026" and on a US one "Aug 14, 2026".
 */
export function displayLocale(language: string, region: string | null | undefined): string {
  const tag = region ? `${language}-${region}` : language;
  try {
    new Intl.DateTimeFormat(tag);
    return tag;
  } catch {
    // A malformed tag throws; an unknown one already falls back on its own.
    return language;
  }
}

/** The region subtag of a BCP 47 tag ("en-US" → "US"), or null. */
export function regionOf(tag: string | null | undefined): string | null {
  const match = /^[a-z]{2,3}(?:-[a-z]{4})?-([a-z]{2}|\d{3})(?:-|$)/i.exec(tag ?? '');
  return match ? match[1]!.toUpperCase() : null;
}

function format(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options)
    .formatToParts(date)
    .map((part) => (part.type === 'month' ? part.value.replace(/\.$/, '') : part.value))
    .join('');
}

/** A UTC instant's calendar date, in the device's time zone. */
export function formatDate(value: Instant, locale: string): string {
  return format(new Date(value), locale, { dateStyle: 'medium' });
}

/** A UTC instant as date and time, in the device's time zone. */
export function formatDateTime(value: Instant, locale: string): string {
  return format(new Date(value), locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * A local calendar day stored as `YYYY-MM-DD` (a license's valid-until, a day
 * group). Read as that local day, never as UTC midnight, which is the day
 * before anywhere west of Greenwich. Anything else is returned unchanged.
 */
export function formatDay(day: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return format(date, locale, { dateStyle: 'medium' });
}

/**
 * A wall-clock time at the range (`HH:mm`, already local there), in the
 * locale's style. Formatted at UTC so the device's own zone cannot move it.
 */
export function formatWallClockTime(time: string, locale: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2]))),
  );
}

/**
 * A chart axis label: day and short month, with the year when the range
 * crosses one (#349).
 */
export function formatAxisDate(value: Instant, locale: string, withYear: boolean): string {
  return format(new Date(value), locale, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
