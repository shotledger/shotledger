// "Did I actually shoot this one?"
//
// A signup is not a result: you can enter a competition and then not turn
// up, or not finish. Import Results therefore offers competitions where
// the shooter's card number appears in the RESULTS, not the ones they
// merely signed up for (maintainer, 2026-09-11).
//
// This is the pure half. The expensive half — one /results call per
// competition, since WebShooter has no "my competitions" endpoint and
// wscli's own commands iterate the same way — lives in the app hook.
import { cardNumbersMatch } from './identity';
import type { ResultRow } from './api/schemas';

/**
 * True when this card number appears anywhere in a competition's results,
 * including the finals and särskjutning sections.
 *
 * A row whose signup has been removed carries no card number and cannot be
 * attributed to anyone, so it never matches.
 */
export function hasResultForCard(
  results: readonly ResultRow[],
  cardNumber: string | null,
): boolean {
  if (cardNumber === null) return false;
  return results.some((row) =>
    cardNumbersMatch(row.signup?.user?.shooting_card_number ?? null, cardNumber),
  );
}
