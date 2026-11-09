import { Client } from 'pg';
import { migrations } from './migrations.js';

export async function runMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migration of migrations) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE id = $1',
        [migration.id],
      );

      if (applied.rowCount) {
        console.log(`Migration already applied: ${migration.id}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [
          migration.id,
        ]);
        await client.query('COMMIT');
        console.log(`Applied migration: ${migration.id}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

runMigrations(connectionString).catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
