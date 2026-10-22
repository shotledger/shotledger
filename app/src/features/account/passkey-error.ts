// Why a passkey sign-in, addition or removal on the phone did not finish, for
// the line Account & Sync shows. The keys match the web's
// (web/src/passkey-error.ts) so both read `account.passkey.error.*`.
import { AuthError } from '@shotledger/shared';

export type PasskeyErrorKey =
  'cancelled' | 'alreadyAdded' | 'notRegistered' | 'signInAgain' | 'network' | 'unknown';

/** `intent` decides what a 401/403 from the Worker means. */
export function passkeyErrorKey(error: unknown, intent: 'signIn' | 'add'): PasskeyErrorKey {
  if (error instanceof AuthError) {
    // verify-authentication: no account has this passkey.
    if (intent === 'signIn' && error.status === 401) return 'notRegistered';
    // generate-register-options needs a session under a day old (better-auth's freshAge).
    if (intent === 'add' && (error.status === 401 || error.status === 403)) return 'signInAgain';
    return error.status >= 500 || error.status === 429 || error.status === 408
      ? 'network'
      : 'unknown';
  }
  // react-native-passkey rejects with `{ error, message }`.
  const code = (error as { error?: unknown } | null)?.error;
  if (code === 'UserCancelled' || code === 'NoCredentials' || code === 'Interrupted') {
    return 'cancelled';
  }
  if (code === 'CredentialAlreadyExists') return 'alreadyAdded';
  if (typeof code === 'string') return 'unknown';
  // No status and no library code: the request never reached the server.
  return 'network';
}
