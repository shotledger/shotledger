// Localized rendering of the sight turns computed in shared/. The direction
// words are i18n keys (§0 rule 5); the click counts stay bare numbers, which
// is also what keeps the phrasing plural-free in both languages ("1 up",
// "10 up" / "1 upp", "10 upp").
import type { TFunction } from 'i18next';
import type { SightTurns } from '@shotledger/shared';

/** "10 up, 2 right" — empty string when there is nothing to dial. */
export function sightTurnsText(t: TFunction, turns: SightTurns): string {
  return [turns.elevation, turns.windage]
    .filter((turn) => turn !== null)
    .map((turn) => `${turn.clicks} ${t(`firearms.sightDirection${capitalize(turn.direction)}`)}`)
    .join(', ');
}

/** "+5" / "-5" / "0", em dash when the axis was never recorded. */
export function sightClicksText(clicks: number | null): string {
  if (clicks === null) return '—';
  return clicks > 0 ? `+${clicks}` : String(clicks);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
