// Hash routes: `#statistics`, `#entry`, `#bulk`, `#settings`, `#account`,
// `#sessions`, `#sessions/<id>`, `#sessions/<id>/edit`, `#compare` (the
// picked photos, under Sessions) and `#license-check`,
// `#license-check/new-firearm`, `#license-check/firearm/<id>` (under
// Statistics, which links to it as the phone's Home does).
export type Page = 'sessions' | 'statistics' | 'entry' | 'bulk' | 'settings' | 'account';

export interface Route {
  page: Page;
  /** The session the detail view shows; null on the list and every other page. */
  sessionId: string | null;
  compare?: true;
  /** The session's edit form (docs/specs/web-session-edit-spec.md §3.2). */
  edit?: true;
  /** License Check (#796): its overview, New Firearm, or one firearm. */
  check?: LicenseCheckView;
}

export type LicenseCheckView =
  { view: 'overview' } | { view: 'newFirearm' } | { view: 'firearm'; firearmId: string };

/** The hash that opens a License Check view. */
export function licenseCheckHash(check: LicenseCheckView): string {
  if (check.view === 'newFirearm') return '#license-check/new-firearm';
  if (check.view === 'firearm') {
    return `#license-check/firearm/${encodeURIComponent(check.firearmId)}`;
  }
  return '#license-check';
}

function licenseCheckView(rest: string): LicenseCheckView {
  if (rest === 'new-firearm') return { view: 'newFirearm' };
  if (rest.startsWith('firearm/')) {
    try {
      const firearmId = decodeURIComponent(rest.slice('firearm/'.length));
      if (firearmId !== '') return { view: 'firearm', firearmId };
    } catch {
      // a malformed escape: show the overview
    }
  }
  return { view: 'overview' };
}

export function routeFromHash(hash: string): Route {
  if (hash === '#account') return { page: 'account', sessionId: null };
  if (hash === '#entry') return { page: 'entry', sessionId: null };
  if (hash === '#bulk') return { page: 'bulk', sessionId: null };
  if (hash === '#settings') return { page: 'settings', sessionId: null };
  if (hash === '#sessions') return { page: 'sessions', sessionId: null };
  if (hash === '#compare') return { page: 'sessions', sessionId: null, compare: true };
  if (hash === '#license-check' || hash.startsWith('#license-check/')) {
    const check = licenseCheckView(hash.slice('#license-check/'.length));
    return { page: 'statistics', sessionId: null, check };
  }
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
  const route = routeFromHash(hash);
  return route.page === 'statistics' && !route.check && hash !== '#statistics'
    ? '#statistics'
    : null;
}
