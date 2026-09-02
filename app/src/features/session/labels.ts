// Localized labels for discipline/program/competition-level ids. The ids
// themselves live in shared/ data files; their display names are i18n keys so
// every string on screen goes through i18n (§0 rule 5).
import type { TFunction } from 'i18next';
import { getDiscipline, getProgram } from '@shotledger/shared';

export const COMPETITION_LEVELS = ['forening', 'krets', 'landsdel', 'national', 'riks'] as const;
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];

export function disciplineLabel(t: TFunction, id: string): string {
  return t(`discipline.${id}`, { defaultValue: getDiscipline(id)?.name.en ?? id });
}

export function programLabel(t: TFunction, id: string | null): string {
  if (!id) return t('session.freeTraining');
  return t(`program.${id}`, { defaultValue: getProgram(id)?.name.en ?? id });
}

export function competitionLevelLabel(t: TFunction, level: string): string {
  return t(`competitionLevel.${level}`, { defaultValue: level });
}

/**
 * The short label used in a default session name: mästerskap is a flag on a
 * level (SHB C.3.1), so KM = förening + flag and SM = riks + flag.
 */
export function levelShortLabel(t: TFunction, level: string, isChampionship: boolean): string {
  const key = isChampionship ? `championshipShort.${level}` : `competitionLevelShort.${level}`;
  return t(key, { defaultValue: level });
}

export function formatLocalDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}
