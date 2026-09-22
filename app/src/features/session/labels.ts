// Localized labels for discipline/program/competition-level ids. The ids
// themselves live in shared/ data files; their display names are i18n keys so
// every string on screen goes through i18n (§0 rule 5).
import type { TFunction } from 'i18next';
import { getDiscipline, getProgram, type Program } from '@shotledger/shared';

export const COMPETITION_LEVELS = ['forening', 'krets', 'landsdel', 'national', 'riks'] as const;
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];

export function disciplineLabel(t: TFunction, id: string): string {
  return t(`discipline.${id}`, { defaultValue: getDiscipline(id)?.name.en ?? id });
}

/**
 * The chips on the Match Format row. While a discipline ships exactly one
 * program, naming the chip after the program names it after the discipline one
 * row above (#348); a second program would have to be told apart by name.
 */
export function matchFormatLabel(t: TFunction, id: string | null, choices: number): string {
  if (!id) return t('session.freeFormat');
  if (choices > 1) return t(`program.${id}`, { defaultValue: getProgram(id)?.name.en ?? id });
  return t('session.fullMatch');
}

/** What picking Full Match actually lays out; null when it lays out nothing. */
export function matchFormatHint(t: TFunction, program: Program): string | null {
  const final = program.supportsFinal ? t('session.fullMatchHintFinal') : null;
  const structure = program.structure;
  if (!structure) return final;

  const scoring = structure.groups.reduce((total, group) => total + group.seriesCount, 0);
  const limits = structure.groups.map((group) => group.timeLimitSeconds);
  // Distinct limits in group order: milsnabb's 4x10, 4x8, 4x6 reads "10/8/6".
  // A program mixing timed and untimed groups names no time at all.
  const times = limits.every((seconds) => seconds !== undefined)
    ? [...new Set(limits)].join('/')
    : null;
  // Every shipped program has 0 or 1 sighter series; more than one is counted
  // in with the rest rather than given wording of its own.
  const sighter = structure.sighterSeries === 1;
  const series = sighter ? scoring : scoring + structure.sighterSeries;
  const key = sighter
    ? times
      ? 'session.fullMatchHintSighterTimed'
      : 'session.fullMatchHintSighter'
    : times
      ? 'session.fullMatchHintTimed'
      : 'session.fullMatchHint';

  const laidOut = t(key, { series, times });
  return final ? `${laidOut} ${final}` : laidOut;
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
