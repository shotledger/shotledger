// Localized rendering of the sight turns computed in shared/. The direction
// words are i18n keys (§0 rule 5); the click counts stay bare numbers, which
// is also what keeps the phrasing plural-free in both languages ("1 up",
// "10 up" / "1 upp", "10 upp").
import type { TFunction } from 'i18next';
import { sightTurnsBetween, type SightAdjustment, type SightTurns } from '@shotledger/shared';

/** "10 up, 2 right" — empty string when there is nothing to dial. */
export function sightTurnsText(t: TFunction, turns: SightTurns): string {
  return [turns.elevation, turns.windage]
    .filter((turn) => turn !== null)
    .map((turn) => `${turn.clicks} ${t(`firearms.sightDirection${capitalize(turn.direction)}`)}`)
    .join(', ');
}

type LabeledSetting = SightAdjustment & { id: string; label: string };

/**
 * A sight-setting's segment/chip label: the current setting is just its
 * label; every other setting also carries the turns to dial to reach it
 * from the current one, when there is anything to turn.
 */
export function sightSettingLabel(
  t: TFunction,
  current: LabeledSetting | null,
  setting: LabeledSetting,
): string {
  if (setting.id === current?.id) return setting.label;
  const turns = sightTurnsText(t, sightTurnsBetween(current, setting));
  return turns ? `${setting.label} · ${turns}` : setting.label;
}

/** "+5" / "-5" / "0", em dash when the axis was never recorded. */
export function sightClicksText(clicks: number | null): string {
  if (clicks === null) return '—';
  return clicks > 0 ? `+${clicks}` : String(clicks);
}

/**
 * "+5 up" / "-3 left" — the signed count plus the direction it means, because
 * a bare sign is not legible as up/down or left/right. Zero has no direction,
 * and `null` falls back to `sightClicksText`'s em dash.
 */
export function sightClicksDirectionText(
  t: TFunction,
  clicks: number | null,
  axis: 'elevation' | 'windage',
): string {
  const text = sightClicksText(clicks);
  if (clicks === null || clicks === 0) return text;
  const direction =
    axis === 'elevation' ? (clicks > 0 ? 'Up' : 'Down') : clicks > 0 ? 'Right' : 'Left';
  return `${text} ${t(`firearms.sightDirection${direction}`)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
