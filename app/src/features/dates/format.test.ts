import {
  displayLocale,
  formatAxisDate,
  formatDate,
  formatDateTime,
  formatDay,
  formatWallClockTime,
  regionOf,
} from './format';

// jest.config.js pins TZ to Europe/Stockholm.
describe('displayLocale', () => {
  it('joins the app language and the device region', () => {
    expect(displayLocale('en', 'SE')).toBe('en-SE');
    expect(displayLocale('sv', 'SE')).toBe('sv-SE');
  });

  it('is the bare language without a region', () => {
    expect(displayLocale('en', null)).toBe('en');
    expect(displayLocale('sv', undefined)).toBe('sv');
  });

  it('falls back to the language for a malformed region', () => {
    expect(displayLocale('en', '!!')).toBe('en');
  });
});

describe('regionOf', () => {
  it.each([
    ['en-US', 'US'],
    ['sv-SE', 'SE'],
    ['zh-Hant-TW', 'TW'],
    ['es-419', '419'],
    ['en-us', 'US'],
  ])('%s → %s', (tag, region) => {
    expect(regionOf(tag)).toBe(region);
  });

  it.each(['en', '', null, undefined])('has none in %j', (tag) => {
    expect(regionOf(tag)).toBeNull();
  });
});

describe('formatDate', () => {
  it('follows the region for English', () => {
    expect(formatDate('2026-10-12T08:00:00.000Z', 'en-SE')).toBe('12 Oct 2026');
    expect(formatDate('2026-10-12T08:00:00.000Z', 'en-US')).toBe('Oct 12, 2026');
  });

  it('drops the abbreviated-month dot in Swedish', () => {
    expect(formatDate('2026-08-14T08:00:00.000Z', 'sv-SE')).toBe('14 aug 2026');
    expect(formatDate('2026-05-05T08:00:00.000Z', 'sv-SE')).toBe('5 maj 2026');
  });

  it('uses the local day of the instant', () => {
    // 23:30 UTC on the 12th is 01:30 on the 13th in Stockholm.
    expect(formatDate('2026-10-12T23:30:00.000Z', 'sv-SE')).toBe('13 okt 2026');
  });

  it('takes epoch milliseconds and Dates', () => {
    const ms = Date.parse('2026-10-12T08:00:00.000Z');
    expect(formatDate(ms, 'en-SE')).toBe('12 Oct 2026');
    expect(formatDate(new Date(ms), 'en-SE')).toBe('12 Oct 2026');
  });
});

describe('formatDateTime', () => {
  it('adds the local time in the locale’s style', () => {
    expect(formatDateTime('2026-10-12T18:33:08.000Z', 'sv-SE')).toBe('12 okt 2026 20:33');
    expect(formatDateTime('2026-10-12T18:33:08.000Z', 'en-US')).toMatch(/^Oct 12, 2026, 8:33\sPM$/);
  });
});

describe('formatDay', () => {
  it('formats a stored local day as that day', () => {
    expect(formatDay('2026-08-13', 'sv-SE')).toBe('13 aug 2026');
    expect(formatDay('2029-03-30', 'en-US')).toBe('Mar 30, 2029');
  });

  it('returns anything that is not a day unchanged', () => {
    expect(formatDay('tills vidare', 'sv-SE')).toBe('tills vidare');
  });
});

describe('formatAxisDate', () => {
  it('names the year only when asked', () => {
    expect(formatAxisDate('2026-04-13T08:00:00.000Z', 'sv-SE', false)).toBe('13 apr');
    expect(formatAxisDate('2026-04-13T08:00:00.000Z', 'sv-SE', true)).toBe('13 apr 2026');
    expect(formatAxisDate('2026-04-13T08:00:00.000Z', 'en-US', false)).toBe('Apr 13');
  });
});

describe('formatWallClockTime', () => {
  it('keeps the range time whatever the device zone', () => {
    expect(formatWallClockTime('09:50', 'sv-SE')).toBe('09:50');
    expect(formatWallClockTime('23:40', 'en-US')).toMatch(/^11:40\sPM$/);
  });

  it('returns anything else unchanged', () => {
    expect(formatWallClockTime('9.50', 'sv-SE')).toBe('9.50');
  });
});
