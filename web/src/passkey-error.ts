// Why a passkey sign-in or registration did not finish, for the message the
// page shows. Cancelling the browser's prompt is not an error worth a line.
export type PasskeyError = 'cancelled' | 'alreadyAdded' | 'notRegistered' | 'network' | 'unknown';

/** `status` is an `AuthError`'s; anything else is the browser's error. */
export function passkeyError(error: unknown): PasskeyError {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status !== 'number') return 'unknown';
    // verify-authentication: a passkey on no account (removed, or another site's).
    if (status === 401) return 'notRegistered';
    return status >= 500 || status === 429 || status === 408 ? 'network' : 'unknown';
  }
  if (error instanceof Error) {
    // @simplewebauthn/browser's WebAuthnError carries the DOMException's name.
    const code = (error as { code?: unknown }).code;
    if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'alreadyAdded';
    if (code === 'ERROR_CEREMONY_ABORTED') return 'cancelled';
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') return 'cancelled';
    if (error.name === 'InvalidStateError') return 'alreadyAdded';
    if (error.name === 'TypeError') return 'network';
  }
  return 'unknown';
}
