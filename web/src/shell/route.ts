// Hash routes: `#statistics`, `#entry`, `#bulk`, `#settings`, `#account`,
// `#sessions`, `#sessions/<id>`, `#sessions/<id>/edit` and `#compare` (the
// picked photos, under Sessions).
export type Page = 'sessions' | 'statistics' | 'entry' | 'bulk' | 'settings' | 'account';

export interface Route {
  page: Page;
  /** The session the detail view shows; null on the list and every other page. */
  sessionId: string | null;
  compare?: true;
  /** The session's edit form (docs/specs/web-session-edit-spec.md §3.2). */
  edit?: true;
}

export function routeFromHash(hash: string): Route {
  if (hash === '#account') return { page: 'account', sessionId: null };
  if (hash === '#entry') return { page: 'entry', sessionId: null };
  if (hash === '#bulk') return { page: 'bulk', sessionId: null };
  if (hash === '#settings') return { page: 'settings', sessionId: null };
  if (hash === '#sessions') return { page: 'sessions', sessionId: null };
  if (hash === '#compare') return { page: 'sessions', sessionId: null, compare: true };
  if (hash.startsWith('#sessions/')) {
    // An id is encoded, so a raw slash only ever comes before `edit`.
    const [encoded = '', rest] = hash.slice('#sessions/'.length).split('/', 2);
    let id: string | null;
    try {
      id = decodeURIComponent(encoded) || null;
    } catch {
      id = null; // a malformed escape: show the list
    }
    return rest === 'edit' && id !== null
      ? { page: 'sessions', sessionId: id, edit: true }
      : { page: 'sessions', sessionId: id };
  }
  return { page: 'statistics', sessionId: null };
}

/**
 * The hash to put in the address bar instead of `hash`, or null when it names
 * a page: an unknown or empty hash shows Statistics, so it should say so.
 */
export function replacementHash(hash: string): string | null {
  return routeFromHash(hash).page === 'statistics' && hash !== '#statistics' ? '#statistics' : null;
}
