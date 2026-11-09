import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import type { CreateSessionInput, Session } from './session.types.js';
import type { SessionsRepository } from './sessions.repository.js';

interface SessionRow {
  id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

@Injectable()
export class PostgresSessionsRepository implements SessionsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const result = await this.pool.query<SessionRow>(
      `
        INSERT INTO sessions (id, user_id, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, created_at, expires_at, revoked_at
      `,
      [input.id, input.userId, input.expiresAt],
    );

    return mapSession(result.rows[0]);
  }

  async findActiveById(id: string): Promise<Session | null> {
    const result = await this.pool.query<SessionRow>(
      `
        SELECT id, user_id, created_at, expires_at, revoked_at
        FROM sessions
        WHERE id = $1
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1
      `,
      [id],
    );

    const row = result.rows[0];
    return row ? mapSession(row) : null;
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        UPDATE sessions
        SET revoked_at = now()
        WHERE id = $1
          AND revoked_at IS NULL
      `,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }
}
