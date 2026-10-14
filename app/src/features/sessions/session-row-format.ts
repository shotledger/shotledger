// How a session reads in a list, on the phone and the web alike (#822,
// direction A: findings "Numbers that need decoding" and "Repeated labels
// and double titles"). No react-native import and no `@/` path, so the web
// imports this file as it is.
import { formatShooterClass, sameTagName, weaponGroupLabel } from '@shotledger/shared';
import type { TFunction } from 'i18next';

import en from '../../i18n/en.json';
import sv from '../../i18n/sv.json';

export type SessionType = 'training' | 'competition';

/** The words for a session type in every UI language ("Training", "Träning"). */
const TYPE_LABELS: Record<SessionType, readonly string[]> = {
  training: [en.sessionType.training, sv.sessionType.training],
  competition: [en.sessionType.competition, sv.sessionType.competition],
};

/**
 * Whether a row should print its session type. A tag that says the same
 * thing ("Träning" on a training session) already does, and printing both
 * made every row say it twice. Any UI language counts, because a tag is
 * typed in whichever language the shooter thinks in.
 */
export function typeShownBesideTags(type: SessionType, tags: readonly string[]): boolean {
  return !tags.some((tag) => TYPE_LABELS[type].some((label) => sameTagName(tag, label)));
}

/**
 * A generated name ("Training — Oct 14, 2026") without the date it ends
 * with, for a row that prints the date anyway. Only a suffix equal to one of
 * `dateLabels` goes, so a name the shooter typed is never cut. A name that
 * would be left empty is kept whole.
 */
export function withoutDateSuffix(name: string, dateLabels: readonly string[]): string {
  const separator = ' — ';
  const at = name.lastIndexOf(separator);
  if (at <= 0) return name;
  const suffix = name.slice(at + separator.length).trim();
  if (!dateLabels.some((label) => label.trim() === suffix)) return name;
  return name.slice(0, at).trim() || name;
}

/** Inner tens, always printed, including "0X" (maintainer's ruling, #822). */
export function formatInnerTens(count: number): string {
  return `${count}X`;
}

/**
 * Weapon group and class in words ("Weapon group C, class 2") instead of
 * the code "C2", which a reader had to know to decode.
 */
export function formatGroupAndClassWords(
  t: TFunction,
  groupId: string | null | undefined,
  classCode: string | null | undefined,
): string | null {
  const group = groupId ? weaponGroupLabel(groupId) : '';
  const klass = formatShooterClass(classCode);
  if (group && groupId === 'generic:airgun') {
    return klass ? t('homeA.airgunAndClass', { class: klass }) : t('homeA.airgun');
  }
  if (group && klass) return t('homeA.groupAndClass', { group, class: klass });
  if (group) return t('homeA.group', { group });
  if (klass) return t('homeA.class', { class: klass });
  return null;
}
