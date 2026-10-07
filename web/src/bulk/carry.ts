// A status the Bulk Edit page hands to its own next mount (R15). When another
// account signs in, App remounts the page and its state goes; what the user
// must still hear (a dropped correction) is carried across, in memory only.
import type { ApplyState } from './apply';

let carried: ApplyState | null = null;

export function carry(state: ApplyState): void {
  carried = state;
}

/** The carried state, if any; reading does not clear it (StrictMode mounts twice). */
export function peekCarried(): ApplyState | null {
  return carried;
}

export function clearCarried(): void {
  carried = null;
}
