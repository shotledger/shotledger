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
      `CREATE TABLE rate_limit (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        count INTEGER NOT NULL,
        last_request INTEGER NOT NULL
      )`,
      `CREATE TABLE passkey (
        id TEXT PRIMARY KEY,
        name TEXT,
        public_key TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL,
        counter INTEGER NOT NULL,
        device_type TEXT NOT NULL,
        backed_up INTEGER NOT NULL,
        transports TEXT,
        created_at INTEGER,
        aaguid TEXT
      )`,
      `CREATE INDEX passkey_userId_idx ON passkey (user_id)`,
      `CREATE UNIQUE INDEX passkey_credentialID_idx ON passkey (credential_id)`,
    ],
  },
];
