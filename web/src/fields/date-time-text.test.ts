import { describe, expect, it } from 'vitest';

import {
  datePlaceholder,
  formatDateText,
  formatTimeText,
  parseDateText,
  parseTimeText,
} from './date-time-text';

const NNBSP = ' ';
const LETTERS = { year: 'YYYY', month: 'MM', day: 'DD' };

describe('formatDateText', () => {
  it.each([
    ['sv', '2026-09-02'],
    ['sv-SE', '2026-09-02'],
    ['en-SE', '2026-09-02'],
    ['en-US', '09/02/2026'],
    ['en', '09/02/2026'],
    ['en-GB', '02/09/2026'],
    ['sv-FI', '02.09.2026'],
    ['en-ZA', '2026/09/02'],
  ])('%s shows 2026-09-02 as %s', (locale, shown) => {
    expect(formatDateText('2026-09-02', locale)).toBe(shown);
  });

  it('pads a one-digit month and day', () => {
    expect(formatDateText('2026-9-2', 'sv')).toBe('2026-09-02');
  });

  it('leaves anything that is not a stored day alone', () => {
    expect(formatDateText('', 'sv')).toBe('');
    expect(formatDateText('22/09/2026', 'sv')).toBe('22/09/2026');
  });
});

describe('datePlaceholder', () => {
  it('spells the format in the given letters', () => {
    expect(datePlaceholder('sv', { year: 'ÅÅÅÅ', month: 'MM', day: 'DD' })).toBe('ÅÅÅÅ-MM-DD');
    expect(datePlaceholder('en-US', LETTERS)).toBe('MM/DD/YYYY');
    expect(datePlaceholder('en-GB', LETTERS)).toBe('DD/MM/YYYY');
  });
});

describe('parseDateText', () => {
  it.each([
    ['sv', '2026-09-22'],
    ['sv', '2026 9 22'],
    ['sv', '2026.09.22'],
    ['en-US', '09/22/2026'],
    ['en-US', '9-22-2026'],
    ['en-US', '2026-09-22'],
    ['en-US', '2026/09/22'],
    ['en-GB', '22/09/2026'],
    ['en-GB', '22.9.2026'],
    ['sv-FI', '22.09.2026'],
    ['en-ZA', '2026/09/22'],
    ['sv', '  2026-09-22  '],
  ])('%s reads %j as 2026-09-22', (locale, text) => {
    expect(parseDateText(text, locale)).toBe('2026-09-22');
  });

  it('reads blank as no date', () => {
    expect(parseDateText('', 'sv')).toBe('');
    expect(parseDateText('   ', 'en-US')).toBe('');
  });

  it.each([
    ['sv', '2026-02-30'],
    ['sv', '2026-13-01'],
    ['sv', '2026-00-10'],
    ['en-US', '22/09/2026'],
    ['en-GB', '31/04/2026'],
    ['en-US', '09/22/26'],
    ['en-US', '09/22/20266'],
    ['en-US', '009/22/2026'],
    ['en-US', '09/022/2026'],
    ['sv', '2026-09'],
    ['sv', '2026-09-22-01'],
    ['sv', 'igår'],
    ['sv', '2026-123-01'],
  ])('%s refuses %j', (locale, text) => {
    expect(parseDateText(text, locale)).toBeNull();
  });

  it('keeps a leap day only in a leap year', () => {
    expect(parseDateText('2024-02-29', 'sv')).toBe('2024-02-29');
    expect(parseDateText('2026-02-29', 'sv')).toBeNull();
  });

  it('reads a year under 100 as that year, for the range check to refuse', () => {
    expect(parseDateText('0026-09-22', 'sv')).toBe('0026-09-22');
  });

  it('round-trips what it shows', () => {
    for (const locale of ['sv', 'en-US', 'en-GB', 'sv-FI', 'en-ZA']) {
      expect(parseDateText(formatDateText('2026-01-31', locale), locale)).toBe('2026-01-31');
    }
  });
});

describe('formatTimeText', () => {
  it.each([
    ['sv', '18:00', '18:00'],
    ['sv', '00:05', '00:05'],
    ['en-GB', '18:00', '18:00'],
    ['sv-FI', '18:00', '18.00'],
    ['en-US', '18:00', '6:00 PM'],
    ['en-US', '00:05', '12:05 AM'],
    ['en-CA', '18:00', '6:00 p.m.'],
  ])('%s shows %s as %j', (locale, time, shown) => {
    expect(formatTimeText(time, locale)).toBe(shown);
  });

  it('leaves anything that is not a stored time alone', () => {
    expect(formatTimeText('', 'sv')).toBe('');
    expect(formatTimeText('6 pm', 'sv')).toBe('6 pm');
  });
});

describe('parseTimeText', () => {
  it.each([
    ['sv', '18:00', '18:00'],
    ['sv', '18.00', '18:00'],
    ['sv', '18 00', '18:00'],
    ['sv', '1800', '18:00'],
    ['sv', '18', '18:00'],
    ['sv', '18:', '18:00'],
    ['sv', '930', '09:30'],
    ['sv', '0:05', '00:05'],
    ['sv', ' 7:45 ', '07:45'],
    ['sv-FI', '18.05', '18:05'],
    ['en-US', `6:00${NNBSP}PM`, '18:00'],
    ['en-US', '6:00 pm', '18:00'],
    ['en-US', '6pm', '18:00'],
    ['en-US', '6 P.M.', '18:00'],
    ['en-US', '12:05 AM', '00:05'],
    ['en-US', '12:30 PM', '12:30'],
    ['en-US', '11:59 pm', '23:59'],
    ['en-US', '18:00', '18:00'],
    ['en-CA', '6:00 p.m.', '18:00'],
    ['en-CA', '6:00 a.m.', '06:00'],
    ['sv', '6 pm', '18:00'],
  ])('%s reads %j as %s', (locale, text, time) => {
    expect(parseTimeText(text, locale)).toBe(time);
  });

  it('reads blank as no time', () => {
    expect(parseTimeText('', 'sv')).toBe('');
    expect(parseTimeText('  ', 'en-US')).toBe('');
  });

  it.each([
    ['sv', '24:00'],
    ['sv', '18:60'],
    ['sv', '18:0'],
    ['sv', '123:00'],
    ['sv', 'kväll'],
    ['en-US', '13:00 PM'],
    ['en-US', '0:30 AM'],
    ['en-US', '6:00 xm'],
    ['sv', '18:00:00'],
  ])('%s refuses %j', (locale, text) => {
    expect(parseTimeText(text, locale)).toBeNull();
  });

  it('round-trips what it shows', () => {
    for (const locale of ['sv', 'en-US', 'en-GB', 'sv-FI', 'en-CA']) {
      for (const time of ['00:00', '06:05', '12:00', '18:30', '23:59']) {
        expect(parseTimeText(formatTimeText(time, locale), locale)).toBe(time);
      }
    }
  });
});
