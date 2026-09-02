// Public API of the document-vault crypto envelope (plan.md v2). See
// docs/specs/document-vault-spec.md. `webcrypto-provider.ts` is a test-only
// AesGcmProvider implementation, deliberately not re-exported here — it
// depends on `globalThis.crypto.subtle`, which Hermes/React Native does not
// provide; the app supplies its own expo-crypto-backed provider instead
// (app/src/platform/vault-crypto.ts).
export * from './types';
export * from './envelope';
