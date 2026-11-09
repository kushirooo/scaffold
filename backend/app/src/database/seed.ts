import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PasswordHasher } from '../auth/password-hasher.js';
import type { UserRole } from '../users/user.types.js';

interface DemoUser {
  email: string;
  fullName: string;
  role: UserRole;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'admin@rafconsult.test', fullName: 'Aina Rahman', role: 'ADMIN' },
  {
    email: 'pm@rafconsult.test',
    fullName: 'Faizal Ibrahim',
    role: 'PROJECT_MANAGER',
  },
  { email: 'worker@rafconsult.test', fullName: 'Mei Ling Tan', role: 'WORKER' },
  { email: 'viewer@rafconsult.test', fullName: 'Hafiz Yusof', role: 'VIEWER' },
];

function requireSeedEnvironment(): {
  connectionString: string;
  password: string;
} {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed demo users.');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DEMO_SEED !== 'true'
  ) {
    throw new Error(
      'Refusing to seed demo users in production. Set ALLOW_DEMO_SEED=true to override.',
    );
  }

  const password = process.env.SEED_PASSWORD ?? 'RafConsult!2026';
  if (password.length < 12) {
    throw new Error('SEED_PASSWORD must be at least 12 characters long.');
  }

  return { connectionString, password };
}

async function seedDemoUsers(): Promise<void> {
  const { connectionString, password } = requireSeedEnvironment();
  const hasher = new PasswordHasher();
  const client = new Client({ connectionString });

  await client.connect();
  try {
    await client.query('BEGIN');

    for (const demoUser of DEMO_USERS) {
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
        [demoUser.email],
      );

      const passwordHash = await hasher.hash(password);
      const userId = existing.rows[0]?.id ?? randomUUID();

      if (existing.rowCount) {
        await client.query(
          `
            UPDATE users
            SET full_name = $2,
                role = $3,
                is_active = true,
                updated_at = now()
            WHERE id = $1
          `,
          [userId, demoUser.fullName, demoUser.role],
        );
      } else {
        await client.query(
          `
            INSERT INTO users (id, email, full_name, role, is_active)
            VALUES ($1, $2, $3, $4, true)
          `,
          [userId, demoUser.email, demoUser.fullName, demoUser.role],
        );
      }

      await client.query(
        `
          INSERT INTO credentials (user_id, password_hash)
          VALUES ($1, $2)
          ON CONFLICT (user_id)
          DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            password_updated_at = now()
        `,
        [userId, passwordHash],
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${DEMO_USERS.length} demo users (password: SEED_PASSWORD).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seedDemoUsers().catch((error: unknown) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
