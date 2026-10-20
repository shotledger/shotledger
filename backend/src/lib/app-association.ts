// What ties the phone app to the Worker's domain, so the OS lets the app use
// passkeys bound to it (#681): Android's Digital Asset Links and Apple's
// webcredentials association, and the Android app's WebAuthn origin.

/** `expo.android.package` and `expo.ios.bundleIdentifier` in app/app.json. */
export const APP_ID = 'app.shotledger';

export class AppAssociationError extends Error {
  override name = 'AppAssociationError';
}

const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * `ANDROID_SIGNING_CERT_SHA256`: the SHA-256 fingerprints of the certificates
 * that sign the app, comma-separated, as `keytool` and the Play Console print
 * them (`AB:CD:…`, 32 bytes). Empty means no Android app is associated.
 */
export function signingFingerprints(value: string | undefined): string[] {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  for (const entry of entries) {
    if (!FINGERPRINT.test(entry)) {
      throw new AppAssociationError(`ANDROID_SIGNING_CERT_SHA256 has a malformed entry: ${entry}`);
    }
  }
  return [...new Set(entries)];
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The origin Android's Credential Manager writes into a native app's clientDataJSON. */
export function androidOrigin(fingerprint: string): string {
  const bytes = Uint8Array.from(fingerprint.split(':'), (pair) => parseInt(pair, 16));
  return `android:apk-key-hash:${base64url(bytes)}`;
}

/** /.well-known/assetlinks.json: the app may sign in with this domain's credentials. */
export function assetLinks(fingerprints: readonly string[]): unknown[] {
  return [
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds',
      ],
      target: {
        namespace: 'android_app',
        package_name: APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

const TEAM_ID = /^[A-Z0-9]{10}$/;

/** `APPLE_TEAM_ID`: the 10-character Apple Developer Team ID. Empty means no iOS app. */
export function appleTeamId(value: string | undefined): string | null {
  const id = (value ?? '').trim().toUpperCase();
  if (id.length === 0) return null;
  if (!TEAM_ID.test(id)) throw new AppAssociationError(`APPLE_TEAM_ID is malformed: ${id}`);
  return id;
}

/** /.well-known/apple-app-site-association, webcredentials only. */
export function appleAppSiteAssociation(teamId: string): unknown {
  return { webcredentials: { apps: [`${teamId}.${APP_ID}`] } };
}
