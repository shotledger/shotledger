// The Drizzle schema lives in shared/ so the sync server can derive its
// per-table payload schemas from it (#697). Re-exported here so the app keeps
// importing `@/db/schema`.
export * from '@shotledger/shared/src/sync/schema';
