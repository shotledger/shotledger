import type { TFunction } from 'i18next';

/** "Series n" by order, or "Sighter" (#922); `number` comes from `seriesSlots`. */
export function seriesLabel(t: TFunction, number: number | null): string {
  return number === null ? t('session.sighter') : t('session.seriesTitle', { position: number });
}
