export interface Migration {
  id: string;
  sql: string;
}

/**
 * Migrations are embedded in TypeScript so `nest build` ships them without a
 * separate asset-copy step. Every migration must be idempotent to re-run and
 * is applied inside a transaction by the runner.
 */
export const migrations: Migration[] = [
  {
    id: '001_auth_foundation',
    sql: `
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        email text NOT NULL,
        full_name text NOT NULL,
        role text NOT NULL
          CHECK (role IN ('ADMIN', 'PROJECT_MANAGER', 'WORKER', 'VIEWER')),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(email));

      CREATE TABLE credentials (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        password_hash text NOT NULL,
        password_updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz
      );

      CREATE INDEX sessions_user_id_idx ON sessions (user_id);
      CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

      -- US19 consumes this table. It is created with the auth foundation so the
      -- schema has a single owner and a single migration history.
      CREATE TABLE password_reset_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        used_at timestamptz
      );

      CREATE INDEX password_reset_tokens_user_id_idx
        ON password_reset_tokens (user_id);
      CREATE INDEX password_reset_tokens_expires_at_idx
        ON password_reset_tokens (expires_at);
    `,
  },
];
