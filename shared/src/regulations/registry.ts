// Regelverk — the rule sets a shooter competes under (ADR 0011).
//
// A Swedish pistol shooter is not under one set of rules. SPSF
// (Svenska Pistolskytteförbundet) and SvSF (Svenska Skyttesportförbundet) are
// both real, a shooter can hold membership in both at once, and they define
// different disciplines, different weapon groups and different classes.
//
// The subtlety this file exists for: **SvSF adopts ISSF's rulebook** — the
// Swedish translations of chapters 6, 7 and 8 — rather than inventing its own
// technical rules. So SvSF does NOT redefine air pistol; it takes ISSF's, and
// adds only what ISSF does not have: one pistol discipline of its own
// (snabbluftpistol) and the national championship categories ISSF's event
// list has no row for — open and junior classes at SM/DM, a men's
// sportpistol (docs/reference/svsf-rules.md, "What ISSF Rule 3.3 lacks").
//
// Hence `adopts`. ISSF owns the international disciplines and its definitions
// win; a regulation that adopts it inherits them rather than duplicating them
// (maintainer, 2026-09-12: "Use ISSF when you can. Do not duplicate events.
// ISSF has prio").

import type { Federation } from '../disciplines/schema';

export interface Regulation {
  /** Stable id. Used in settings keys, so it never changes. */
  id: string;
  /** The federation's own name, untranslated — a federation is not localised. */
  displayName: string;
  /** What fits in a chip or a filter row. */
  shortName: string;
  /**
   * Regulations whose disciplines this one competes under without redefining
   * them. Resolved transitively, so a regulation adopting SvSF would inherit
   * ISSF's through it.
   */
  adopts: readonly string[];
  /** Which discipline-definition `federation` value belongs to this regulation. */
  federation: Federation;
  /**
   * Enabled for a new install. SPSF only: it is the app's first market, and a
   * shooter who competes under nothing else should not have to turn anything
   * on to log a session.
   */
  defaultEnabled: boolean;
}

export const SPSF_REGULATION_ID = 'spsf';
export const ISSF_REGULATION_ID = 'issf';
export const SVSF_REGULATION_ID = 'svsf';

export const REGULATIONS: readonly Regulation[] = [
  {
    id: SPSF_REGULATION_ID,
    displayName: 'Svenska Pistolskytteförbundet',
    shortName: 'SPSF',
    adopts: [],
    federation: 'SPSF',
    defaultEnabled: true,
  },
  {
    id: ISSF_REGULATION_ID,
    displayName: 'International Shooting Sport Federation',
    shortName: 'ISSF',
    adopts: [],
    federation: 'ISSF',
    defaultEnabled: false,
  },
  {
    id: SVSF_REGULATION_ID,
    displayName: 'Svenska Skyttesportförbundet',
    shortName: 'SvSF',
    // The whole point: enabling SvSF gives you ISSF's disciplines, because
    // that is what SvSF competes under nationally. Its own additions —
    // snabbluftpistol, and the SM/DM categories in disciplines/entries.ts —
    // are the SvSF-federation definitions.
    adopts: [ISSF_REGULATION_ID],
    federation: 'SvSF',
    defaultEnabled: false,
  },
];

export function findRegulation(id: string): Regulation | null {
  return REGULATIONS.find((regulation) => regulation.id === id) ?? null;
}

/**
 * Every regulation in play, given what the shooter enabled — the enabled ones
 * plus everything they adopt, transitively.
 *
 * Unknown ids are ignored rather than throwing: a settings row written by a
 * build that had a regulation this one does not must not break the app.
 */
export function effectiveRegulations(enabledIds: readonly string[]): readonly Regulation[] {
  const resolved = new Map<string, Regulation>();

  function visit(id: string): void {
    if (resolved.has(id)) return;
    const regulation = findRegulation(id);
    if (regulation === null) return;
    resolved.set(id, regulation);
    for (const adopted of regulation.adopts) visit(adopted);
  }

  for (const id of enabledIds) visit(id);
  // Registry order, not the order the shooter happened to toggle them.
  return REGULATIONS.filter((regulation) => resolved.has(regulation.id));
}

/** The ids of `effectiveRegulations`, for filtering events by regelverk. */
export function effectiveRegulationIds(enabledIds: readonly string[]): readonly string[] {
  return effectiveRegulations(enabledIds).map((regulation) => regulation.id);
}

/**
 * The `federation` values whose disciplines and weapon groups should be
 * offered.
 *
 * `generic` is always included: practice against a ring target belongs to no
 * federation, and a shooter with every regulation turned off can still log a
 * session.
 */
export function activeFederations(enabledIds: readonly string[]): readonly Federation[] {
  const federations = new Set<Federation>(['generic']);
  for (const regulation of effectiveRegulations(enabledIds)) {
    federations.add(regulation.federation);
  }
  return [...federations];
}

/** Settings key for one regulation's on/off state. */
export function regulationEnabledSettingKey(id: string): string {
  return `regulation.${id}.enabled`;
}

/** The ids a fresh install starts with. */
export function defaultEnabledRegulationIds(): readonly string[] {
  return REGULATIONS.filter((regulation) => regulation.defaultEnabled).map(
    (regulation) => regulation.id,
  );
}
