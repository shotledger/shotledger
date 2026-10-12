// The web's binding of the app's date formatter (#746): the app language the
// page shows, with the browser's region.
import {
  displayLocale,
  formatAxisDate,
  formatDate,
  formatDateTime,
  formatDay,
  regionOf,
} from '../../app/src/features/dates/format';
import i18n from './i18n';

type Instant = string | number | Date;

export function dateLocale(): string {
  return displayLocale(i18n.language, regionOf(navigator.language));
}

export const showDate = (value: Instant) => formatDate(value, dateLocale());
export const showDateTime = (value: Instant) => formatDateTime(value, dateLocale());
export const showDay = (day: string) => formatDay(day, dateLocale());
export const showAxisDate = (value: Instant, withYear: boolean) =>
  formatAxisDate(value, dateLocale(), withYear);
