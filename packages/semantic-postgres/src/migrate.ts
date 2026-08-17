import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool, PoolClient } from 'pg';

const MIGRATION_LOCK = 'actual_semantic_postgres_migrations';

export type SemanticMigration = {
  filename: string;
  sql: string;
};

export async function migrateSemanticDatabase(
  pool: Pool,
  suppliedMigrations?: readonly SemanticMigration[],
): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS semantic_schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const migrations = suppliedMigrations ?? (await readMigrationFiles());

  for (const migration of migrations) {
    await applyMigration(pool, migration);
  }
}

async function applyMigration(
  pool: Pool,
  migration: SemanticMigration,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      MIGRATION_LOCK,
    ]);
    const applied = await client.query(
      'SELECT 1 FROM semantic_schema_migrations WHERE filename = $1',
      [migration.filename],
    );
    if (applied.rowCount === 0) {
      await runMigration(client, migration);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runMigration(
  client: PoolClient,
  migration: SemanticMigration,
): Promise<void> {
  await client.query(migration.sql);
  await client.query(
    'INSERT INTO semantic_schema_migrations (filename) VALUES ($1)',
    [migration.filename],
  );
}

async function readMigrationFiles(): Promise<readonly SemanticMigration[]> {
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  const filenames = (await readdir(directory))
    .filter(filename => filename.endsWith('.sql'))
    .sort();
  return Promise.all(
    filenames.map(async filename => ({
      filename,
      sql: await readFile(join(directory, filename), 'utf8'),
    })),
  );
}
