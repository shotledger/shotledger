// §6.6: profile default is locale-based (se when device locale is sv, else
// none) — flagged for maintainer review, not a confirmed product decision.
import type { ProfileSelection } from '@shotledger/shared';

export function resolveDefaultProfileSelection(locale: string): ProfileSelection {
  return locale.toLowerCase().startsWith('sv') ? 'se' : 'none';
}
