// A software WebAuthn authenticator for the Workers tests: one ES256
// credential, "none" attestation, and the JSON shape
// `@simplewebauthn/browser` posts. It lets a test run a real registration
// and sign-in against `@better-auth/passkey` on workerd, with no browser.

type Json = Record<string, unknown>;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function base64url(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

// The CBOR subset COSE keys and attestation objects need (RFC 8949 §3).
function cborHead(major: number, value: number): Uint8Array {
  if (value < 24) return new Uint8Array([(major << 5) | value]);
  if (value < 256) return new Uint8Array([(major << 5) | 24, value]);
  return new Uint8Array([(major << 5) | 25, value >> 8, value & 0xff]);
}

type Cbor = number | string | Uint8Array | Map<number | string, Cbor>;

function cbor(value: Cbor): Uint8Array {
  if (typeof value === 'number') {
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const text = utf8(value);
    return concat(cborHead(3, text.length), text);
  }
  if (value instanceof Uint8Array) return concat(cborHead(2, value.length), value);
  const entries = [...value.entries()].map(([k, v]) => concat(cbor(k), cbor(v)));
  return concat(cborHead(5, value.size), ...entries);
}

/** WebCrypto signs ECDSA as r‖s; WebAuthn wants ASN.1 DER. */
function derSignature(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    let body: Uint8Array = bytes.slice(start);
    if (body[0]! & 0x80) body = concat(new Uint8Array([0]), body);
    return concat(new Uint8Array([0x02, body.length]), body);
  };
  const sequence = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(new Uint8Array([0x30, sequence.length]), sequence);
}

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED = 0x40;

export interface SoftAuthenticator {
  readonly credentialId: string;
  /** The response to `navigator.credentials.create`, as JSON. */
  register(options: { challenge: string }): Promise<Json>;
  /** The response to `navigator.credentials.get`, as JSON. */
  authenticate(options: { challenge: string }): Promise<Json>;
}

/** `origin` is what the "browser" writes into clientDataJSON. */
export async function softAuthenticator(rpId: string, origin: string): Promise<SoftAuthenticator> {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey;
  const fromB64url = (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const coseKey = cbor(
    new Map<number, Cbor>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, fromB64url(jwk.x!)],
      [-3, fromB64url(jwk.y!)],
    ]),
  );
  const rawId = crypto.getRandomValues(new Uint8Array(16));
  const credentialId = base64url(rawId);
  const rpIdHash = await sha256(utf8(rpId));
  let signCount = 0;

  const counter = () => {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, signCount);
    return out;
  };
  const clientData = (type: string, challenge: string) =>
    utf8(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    credentialId,

    async register({ challenge }) {
      const credentialIdLength = new Uint8Array([rawId.length >> 8, rawId.length & 0xff]);
      const authData = concat(
        rpIdHash,
        new Uint8Array([FLAG_USER_PRESENT | FLAG_USER_VERIFIED | FLAG_ATTESTED]),
        counter(),
        new Uint8Array(16), // AAGUID: all zero, as under "none" attestation
        credentialIdLength,
        rawId,
        coseKey,
      );
      const attestationObject = cbor(
        new Map<string, Cbor>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      );
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientData('webauthn.create', challenge)),
          attestationObject: base64url(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      };
    },

    async authenticate({ challenge }) {
      signCount += 1;
      const authData = concat(
        rpIdHash,
        new Uint8Array([FLAG_USER_PRESENT | FLAG_USER_VERIFIED]),
        counter(),
      );
      const clientDataJSON = clientData('webauthn.get', challenge);
      const signed = concat(authData, await sha256(clientDataJSON));
      const raw = new Uint8Array(
        await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, signed),
      );
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientDataJSON),
          authenticatorData: base64url(authData),
          signature: base64url(derSignature(raw)),
        },
        clientExtensionResults: {},
      };
    },
  };
}
