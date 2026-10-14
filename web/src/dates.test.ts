import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatAxisDate,
  formatDate,
  formatDateTime,
  formatDay,
} from '../../app/src/features/dates/format';

// The page's language, without the DOM that ./i18n writes to.
const i18n = vi.hoisted(() => ({ language: 'en' }));
vi.mock('./i18n', () => ({ default: i18n }));

const { dateLocale, showAxisDate, showDate, showDateTime, showDay } = await import('./dates');

function browser(language: string) {
  vi.stubGlobal('navigator', { language });
}

afterEach(() => {
  vi.unstubAllGlobals();
  i18n.language = 'en';
});

describe('the web date formatter', () => {
  it("takes the app's language and the browser's region", () => {
    browser('sv-SE');
    expect(dateLocale()).toBe('en-SE');
    i18n.language = 'sv';
    browser('en-US');
    expect(dateLocale()).toBe('sv-US');
  });

  it('uses the bare language when the browser names no region', () => {
    browser('sv');
    i18n.language = 'sv';
    expect(dateLocale()).toBe('sv');
  });

  it('formats every kind of date in that locale', () => {
    browser('en-GB');
    const at = '2026-03-05T14:30:00.000Z';
    expect(showDate(at)).toBe(formatDate(at, 'en-GB'));
    expect(showDateTime(at)).toBe(formatDateTime(at, 'en-GB'));
    expect(showDay('2026-03-05')).toBe(formatDay('2026-03-05', 'en-GB'));
    expect(showAxisDate(at, true)).toBe(formatAxisDate(at, 'en-GB', true));
    // The binding changes nothing but the locale: en-GB writes the day first.
    expect(showDate(at)).toMatch(/^5 Mar/);
  });
});
