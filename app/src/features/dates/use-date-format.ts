// The phone's binding of `format.ts` to the app language and device region.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import i18n, { deviceRegion } from '@/i18n';

import {
  displayLocale,
  formatAxisDate,
  formatDate,
  formatDateTime,
  formatDay,
  formatWallClockTime,
} from './format';

/** For code outside a component (reports, notifications). */
export function currentDateLocale(): string {
  return displayLocale(i18n.language, deviceRegion());
}

export function useDateFormat() {
  const { i18n: instance } = useTranslation();
  const locale = displayLocale(instance.language, deviceRegion());
  return useMemo(
    () => ({
      locale,
      date: (value: string | number | Date) => formatDate(value, locale),
      dateTime: (value: string | number | Date) => formatDateTime(value, locale),
      day: (day: string) => formatDay(day, locale),
      time: (time: string) => formatWallClockTime(time, locale),
      axis: (value: string | number | Date, withYear: boolean) =>
        formatAxisDate(value, locale, withYear),
    }),
    [locale],
  );
}
