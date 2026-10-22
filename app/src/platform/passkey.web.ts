// Web build of platform/passkey.ts. The web preview offers no passkeys: the
// real web app (web/) has its own, through the browser's WebAuthn.
export function passkeysSupported(): boolean {
  return false;
}

export function createPasskey(_options: Record<string, unknown>): Promise<unknown> {
  return Promise.reject(new Error('Passkeys are not available in the web preview'));
}

export function getPasskey(_options: Record<string, unknown>): Promise<unknown> {
  return Promise.reject(new Error('Passkeys are not available in the web preview'));
}
