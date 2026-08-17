import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool, PoolClient } from 'pg';

const MIGRATION_LOCK = 'actual_semantic_postgres_migrations';

export async function migrateSemanticDatabase(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS semantic_schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  const filenames = (await readdir(directory))
    .filter(filename => filename.endsWith('.sql'))
    .sort();

  for (const filename of filenames) {
    await applyMigration(pool, directory, filename);
  }
}

async function applyMigration(
  pool: Pool,
  directory: string,
  filename: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      MIGRATION_LOCK,
    ]);
    const applied = await client.query(
      'SELECT 1 FROM semantic_schema_migrations WHERE filename = $1',
      [filename],
    );
    if (applied.rowCount === 0) {
      await runMigrationFile(client, directory, filename);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrationFile(
  client: PoolClient,
  directory: string,
  filename: string,
): Promise<void> {
  const sql = await readFile(join(directory, filename), 'utf8');
  await client.query(sql);
  await client.query(
    'INSERT INTO semantic_schema_migrations (filename) VALUES ($1)',
    [filename],
  );
}
