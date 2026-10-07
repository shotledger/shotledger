// Every writing page offers an inline sign-in when its session expires. The
// token then belongs to whoever signed in, so the logbook on screen must too
// (spec R22). Shared by the entry page and the pages built on it.

/** The account the loaded tables belong to; `generation` keys the pages. */
export interface LoadedAccount {
  userId: string | null;
  generation: number;
}

export type ReauthOutcome = 'same' | 'switched';

/**
 * The same user: nothing on screen is stale, the page only clears its
 * signed-out notice. Anyone else, or a load whose user was never confirmed:
 * reload the account and remount the pages, dropping their state.
 */
export function afterReauth(
  loaded: LoadedAccount,
  signedInUserId: string,
): { outcome: ReauthOutcome; next: LoadedAccount } {
  if (loaded.userId === signedInUserId) return { outcome: 'same', next: loaded };
  return {
    outcome: 'switched',
    next: { userId: signedInUserId, generation: loaded.generation + 1 },
  };
}
