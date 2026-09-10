// AES-256-GCM envelope for the on-device document vault.
// See docs/specs/document-vault-spec.md. Pure types — no RN/Expo import
// (shared/ convention, spec constraint N1).

/** Length of the random IV/nonce per seal, in bytes. Never reused for a key. */
export const IV_BYTES = 12;

/** Length of the GCM authentication tag, in bytes. */
export const TAG_BYTES = 16;

/** Current envelope binary layout version (spec "Envelope format"). */
export const ENVELOPE_VERSION = 1;

/**
 * Platform-supplied AES-GCM primitive. `envelope.ts` is provable against a
 * standards-compliant implementation of this interface without depending on
 * a native module (see the Node WebCrypto provider used by tests); the app
 * supplies a real implementation backed by expo-crypto at runtime.
 */
export interface AesGcmProvider<Key> {
  /** Cryptographically secure random bytes, e.g. for the per-seal IV. */
  randomBytes(byteLength: number): Uint8Array;
  encrypt(
    plaintext: Uint8Array,
    key: Key,
    iv: Uint8Array,
  ): Promise<{ ciphertext: Uint8Array; tag: Uint8Array }>;
  /**
   * Must throw when the authentication tag does not match (tamper or wrong
   * key) — never return unverified plaintext.
   */
  decrypt(ciphertext: Uint8Array, tag: Uint8Array, key: Key, iv: Uint8Array): Promise<Uint8Array>;
}

/** Envelope bytes failed AES-GCM authentication: tampered, corrupted, or wrong key. */
export class VaultTamperError extends Error {
  constructor(cause?: unknown) {
    super('Document vault envelope failed authentication (tampered, corrupted, or wrong key)');
    this.name = 'VaultTamperError';
    this.cause = cause;
  }
}

/** Envelope bytes are not a well-formed sealed envelope (too short, unknown version). */
export class VaultEnvelopeFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultEnvelopeFormatError';
  }
}
