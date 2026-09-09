// Pure sight-setting math (issue #114). Click counts are signed and relative to
// whatever reference zero the shooter chose for that firearm, so only the
// DIFFERENCE between two settings is meaningful — that difference is what gets
// dialled in when switching. Positive elevation = up, positive windage = right.

export type SightAdjustment = {
  elevationClicks: number | null;
  windageClicks: number | null;
};

export type ActiveFlagged = {
  id: string;
  isActive: number;
  updatedAt: string;
};

export type SightTurn = {
  direction: 'up' | 'down' | 'left' | 'right';
  clicks: number;
};

/** Null on an axis means nothing to turn there — equal, or not recorded on both sides. */
export type SightTurns = {
  elevation: SightTurn | null;
  windage: SightTurn | null;
};

/**
 * The setting a firearm is currently dialled to, or null when none is marked.
 *
 * Sync resolves conflicts last-write-wins per row, so two devices each marking
 * a different setting active produce two rows with isActive=1 and no way to
 * reject either. Newest `updatedAt` wins, tie-broken on id (uuidv7, so the
 * later id was created later) to keep every device showing the same one.
 */
export function resolveActiveSightSetting<T extends ActiveFlagged>(
  settings: readonly T[],
): T | null {
  let active: T | null = null;
  for (const setting of settings) {
    if (!setting.isActive) continue;
    if (
      active === null ||
      setting.updatedAt > active.updatedAt ||
      (setting.updatedAt === active.updatedAt && setting.id > active.id)
    ) {
      active = setting;
    }
  }
  return active;
}

/** What to turn to go from one setting to another. */
export function sightTurnsBetween(
  from: SightAdjustment | null | undefined,
  to: SightAdjustment | null | undefined,
): SightTurns {
  return {
    elevation: turn(from?.elevationClicks, to?.elevationClicks, 'up', 'down'),
    windage: turn(from?.windageClicks, to?.windageClicks, 'right', 'left'),
  };
}

function turn(
  from: number | null | undefined,
  to: number | null | undefined,
  positive: SightTurn['direction'],
  negative: SightTurn['direction'],
): SightTurn | null {
  if (from == null || to == null) return null;
  const delta = to - from;
  if (delta === 0) return null;
  return { direction: delta > 0 ? positive : negative, clicks: Math.abs(delta) };
}
