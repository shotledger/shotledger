// Feature flags: one typed record, read at build time. An EXPO_PUBLIC_* value
// has to be spelled out literally here — Expo inlines only literal
// `process.env.EXPO_PUBLIC_X` reads. Overridable flags can be flipped on a
// device from /dev, and only where dev tools are on.
import { db } from '@/db/client';
import { type FlagDefinition, getFlagOverrides, resolveFlag } from '@/db/queries/feature-flags';

type FlagSpec = FlagDefinition & { labelKey: string; descriptionKey: string };

export const FLAGS = {
  // Seeding/wiping demo data and the component gallery. On in any dev build; a
  // sideloaded release build opts in with EXPO_PUBLIC_ENABLE_DEV_TOOLS=1. Never
  // set it for a Play build — it ships a wipe button.
  devTools: {
    build: __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === '1',
    overridable: false,
    labelKey: 'dev.flagDevToolsTitle',
    descriptionKey: 'dev.flagDevToolsSubtitle',
  },
  // Serve WebShooter from canned fixtures instead of webshooter.se.
  webshooterMock: {
    build: false,
    overridable: true,
    labelKey: 'webshooter.devMockTitle',
    descriptionKey: 'webshooter.devMockSubtitle',
  },
  // Photo scoring: after the confident hole suggestions, fill up to the
  // series' shot count with the next-best candidates. Off = the default.
  suggestFillToSeries: {
    build: false,
    overridable: true,
    labelKey: 'dev.flagFillToSeriesTitle',
    descriptionKey: 'dev.flagFillToSeriesSubtitle',
  },
  // Photo scoring: draw those filled-in suggestions fainter than the
  // confident ones, so they read as "check this one". Off = drawn alike.
  suggestFilledStyle: {
    build: false,
    overridable: true,
    labelKey: 'dev.flagFilledStyleTitle',
    descriptionKey: 'dev.flagFilledStyleSubtitle',
  },
} as const satisfies Record<string, FlagSpec>;

export type FlagName = keyof typeof FLAGS;

export const DEV_TOOLS_ENABLED = FLAGS.devTools.build;

// An evaluation build's expiry, ISO 8601 (features/evaluation/expiry.ts).
// Unset in every Play build: no profile in eas.json sets it.
export const EVAL_EXPIRES_AT: string | undefined = process.env.EXPO_PUBLIC_EVAL_EXPIRES_AT;

export function isFlagEnabled(name: FlagName): boolean {
  const overrides = DEV_TOOLS_ENABLED ? getFlagOverrides(db) : {};
  return resolveFlag(FLAGS[name], overrides[name], DEV_TOOLS_ENABLED);
}
