// WebShooter integration core — pure logic only (spec docs/specs/
// webshooter-core-spec.md). Not exported from shared/src/index.ts: this is
// an optional integration the app layer imports directly, same convention
// as any other feature-scoped module tree.
export * from './api';
export * from './identity';
export * from './mapping';
export * from './reconcile';
export * from './stats';
export * from './calendar';
