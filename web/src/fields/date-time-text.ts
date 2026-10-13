// The text the web's Date and Time fields show and read (#770): the numeric
// format of `dateLocale()`, not the browser's own. Stored values stay
// `YYYY-MM-DD` and `HH:mm`.

type DatePart = 'year' | 'month' | 'day';

interface DatePattern {
  /** The parts in the locale's order. */
  order: DatePart[];
  /** The text before, between and after the parts: one more than `order`. */
  literals: string[];
}

const ISO_DAY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const ISO_TIME = /^(\d{2}):(\d{2})$/;

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

function datePattern(locale: string): DatePattern {
  const parts = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
    numberingSystem: 'latn',
  }).formatToParts(new Date(Date.UTC(2026, 8, 22)));
  const order: DatePart[] = [];
  const literals = [''];
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      order.push(part.type);
      literals.push('');
    } else {
      literals[literals.length - 1] += part.value;
    }
  }
  return { order, literals };
}

function realDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${pad(year, 4)}-${pad(month)}-${pad(day)}`
    : null;
}

/** A stored `YYYY-MM-DD` in the locale's numeric format; anything else unchanged. */
export function formatDateText(day: string, locale: string): string {
  const match = ISO_DAY.exec(day);
  if (!match) return day;
  const values: Record<DatePart, string> = {
    year: match[1]!,
    month: pad(Number(match[2])),
    day: pad(Number(match[3])),
  };
  const { order, literals } = datePattern(locale);
  return order.reduce((text, part, i) => text + values[part] + literals[i + 1], literals[0]!);
}

/** The format as letters, e.g. `YYYY-MM-DD` or `MM/DD/YYYY`, from the given tokens. */
export function datePlaceholder(locale: string, tokens: Record<DatePart, string>): string {
  const { order, literals } = datePattern(locale);
  return order.reduce((text, part, i) => text + tokens[part] + literals[i + 1], literals[0]!);
}

/**
 * Typed text as `YYYY-MM-DD`: `''` for blank, `null` when it is not a real day.
 * Read in the locale's part order with any separator; a leading year (ISO)
 * is always accepted.
 * The year takes four digits, so a two-digit one never guesses its century.
 */
export function parseDateText(text: string, locale: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const groups = trimmed.split(/\D+/).filter((group) => group !== '');
  if (groups.length !== 3) return null;
  // A leading four-digit year is year-month-day whatever the separator.
  const order: DatePart[] =
    groups[0]!.length === 4 ? ['year', 'month', 'day'] : datePattern(locale).order;
  const values = {} as Record<DatePart, string>;
  order.forEach((part, i) => (values[part] = groups[i]!));
  if (values.year.length !== 4 || values.month.length > 2 || values.day.length > 2) return null;
  return realDay(Number(values.year), Number(values.month), Number(values.day));
}

function timeFormat(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: 'UTC',
    numberingSystem: 'latn',
  });
}

/** A stored `HH:mm` in the locale's short time format; anything else unchanged. */
export function formatTimeText(time: string, locale: string): string {
  const match = ISO_TIME.exec(time);
  if (!match) return time;
  // ICU puts a narrow no-break space before AM/PM; a plain one is what people type.
  return timeFormat(locale)
    .format(new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2]))))
    .replace(/\s/gu, ' ');
}

/** Lower case with spaces and dots gone, so `p.m.`, `PM` and `pm` compare equal. */
const bare = (text: string) => text.toLowerCase().replace(/[\s.]/g, '');

function dayPeriod(locale: string, hour: number): string {
  const part = timeFormat(locale)
    .formatToParts(new Date(Date.UTC(2000, 0, 1, hour)))
    .find((p) => p.type === 'dayPeriod');
  return part === undefined ? '' : bare(part.value);
}

/**
 * Typed text as `HH:mm`: `''` for blank, `null` when it is not a time. Takes
 * any separator or none (`18.00`, `1800`, `18`), and a 24-hour time in every
 * locale; an AM/PM marker (the locale's, or `am`/`pm`) makes it 12-hour.
 */
export function parseTimeText(text: string, locale: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const match = /^(\d{1,2})(?:\D*?(\d{2}))?\s*(\D*)$/.exec(trimmed);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const marker = bare(match[3]!.replace(/^[:.]/, ''));
  if (minute > 59) return null;
  if (marker === '') {
    if (hour > 23) return null;
  } else {
    const am = [dayPeriod(locale, 0), 'am'].includes(marker);
    const pm = [dayPeriod(locale, 12), 'pm'].includes(marker);
    if ((!am && !pm) || hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (pm ? 12 : 0);
  }
  return `${pad(hour)}:${pad(minute)}`;
}
