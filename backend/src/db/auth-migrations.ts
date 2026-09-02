/** See `backend/src/db/migrations.ts` for why this is a TS array, not SQL read at runtime. */
interface D1Migration {
  name: string;
  queries: string[];
}

/**
 * DDL for better-auth's tables (schema.ts: `auth-schema.ts`, generated —
 * see docs/specs/backend-auth-photos-spec.md §1). Mirror of
 * `backend/migrations/0001_auth_init.sql`; keep both in lock-step.
 */
export const AUTH_MIGRATIONS: D1Migration[] = [
  {
    name: '0001_auth_init',
    queries: [
      `CREATE TABLE user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE session (
        id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX session_userId_idx ON session (user_id)`,
      `CREATE TABLE account (
        id TEXT PRIMARY KEY,
        issuer TEXT NOT NULL,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at INTEGER,
        refresh_token_expires_at INTEGER,
        scope TEXT,
        password TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX account_issuer_accountId_uidx ON account (issuer, account_id)`,
      `CREATE INDEX account_userId_idx ON account (user_id)`,
      `CREATE TABLE verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX verification_identifier_idx ON verification (identifier)`,
    ],
  },
];
