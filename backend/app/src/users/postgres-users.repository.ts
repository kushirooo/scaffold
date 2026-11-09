import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module.js';
import type { CreateUserInput, User, UserRole, UserWithPassword } from './user.types.js';
import type { UsersRepository } from './users.repository.js';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface UserWithPasswordRow extends UserRow {
  password_hash: string;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class PostgresUsersRepository implements UsersRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserWithPassword | null> {
    const result = await this.pool.query<UserWithPasswordRow>(
      `
        SELECT
          u.id,
          u.email,
          u.full_name,
          u.role,
          u.is_active,
          u.created_at,
          u.updated_at,
          c.password_hash
        FROM users u
        INNER JOIN credentials c ON c.user_id = u.id
        WHERE lower(u.email) = lower($1)
        LIMIT 1
      `,
      [email.trim()],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return { ...mapUser(row), passwordHash: row.password_hash };
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT id, email, full_name, role, is_active, created_at, updated_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    const row = result.rows[0];
    return row ? mapUser(row) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const id = randomUUID();
    const email = input.email.trim().toLowerCase();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query<UserRow>(
        `
          INSERT INTO users (id, email, full_name, role, is_active)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, email, full_name, role, is_active, created_at, updated_at
        `,
        [id, email, input.fullName.trim(), input.role, input.isActive ?? true],
      );

      await client.query(
        `
          INSERT INTO credentials (user_id, password_hash)
          VALUES ($1, $2)
        `,
        [id, input.passwordHash],
      );

      await client.query('COMMIT');
      return mapUser(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
