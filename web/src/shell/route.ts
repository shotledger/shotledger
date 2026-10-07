// Hash routes: `#statistics`, `#entry`, `#bulk`, `#settings`, `#account`,
// `#sessions`, `#sessions/<id>` and `#compare` (the picked photos, under Sessions).
export type Page = 'sessions' | 'statistics' | 'entry' | 'bulk' | 'settings' | 'account';

export interface Route {
  page: Page;
  /** The session the detail view shows; null on the list and every other page. */
  sessionId: string | null;
  compare?: true;
}

export function routeFromHash(hash: string): Route {
  if (hash === '#account') return { page: 'account', sessionId: null };
  if (hash === '#entry') return { page: 'entry', sessionId: null };
  if (hash === '#bulk') return { page: 'bulk', sessionId: null };
  if (hash === '#settings') return { page: 'settings', sessionId: null };
  if (hash === '#sessions') return { page: 'sessions', sessionId: null };
  if (hash === '#compare') return { page: 'sessions', sessionId: null, compare: true };
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
