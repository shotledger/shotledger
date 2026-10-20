// The OS passkey prompt (#681): Android's Credential Manager and iOS's
// AuthenticationServices, through react-native-passkey. Options and results
// are WebAuthn's JSON form, passed through to and from the Worker untouched.
// The web preview gets passkey.web.ts.
import { Passkey } from 'react-native-passkey';
import type { PasskeyCreateRequest, PasskeyGetRequest } from 'react-native-passkey';

export function passkeysSupported(): boolean {
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}

/** Throws the library's `{ error, message }` on cancel or failure (see passkey-error.ts). */
export function createPasskey(options: Record<string, unknown>): Promise<unknown> {
  return Passkey.create(options as unknown as PasskeyCreateRequest);
}

export function getPasskey(options: Record<string, unknown>): Promise<unknown> {
  return Passkey.get(options as unknown as PasskeyGetRequest);
}
