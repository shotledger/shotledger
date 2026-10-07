// Hash routes: `#statistics`, `#account`, `#sessions` and `#sessions/<id>`.
export type Page = 'sessions' | 'statistics' | 'account';

export interface Route {
  page: Page;
  /** The session the detail view shows; null on the list and every other page. */
  sessionId: string | null;
}

export function routeFromHash(hash: string): Route {
  if (hash === '#account') return { page: 'account', sessionId: null };
  if (hash === '#sessions') return { page: 'sessions', sessionId: null };
  if (hash.startsWith('#sessions/')) {
    let id: string | null;
    try {
      id = decodeURIComponent(hash.slice('#sessions/'.length)) || null;
    } catch {
      id = null; // a malformed escape: show the list
    }
    return { page: 'sessions', sessionId: id };
  }
  return { page: 'statistics', sessionId: null };
}
