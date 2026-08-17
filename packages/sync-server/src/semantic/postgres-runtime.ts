import {
  migrateSemanticDatabase,
  PostgresSemanticStore,
} from '@actual-app/semantic-postgres';
import { semanticFoundationMigration } from '@actual-app/semantic-postgres/foundation-migration';
import { Pool } from 'pg';

import { createSemanticCatalogHandlers } from './catalog-api';
import { resolveActualPrincipal } from './session-principal-adapter';

export async function createPostgresSemanticCatalogHandlers(
  databaseUrl: string,
) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrateSemanticDatabase(pool, [semanticFoundationMigration]);
  } catch (error) {
    await pool.end();
    throw error;
  }

  const store = new PostgresSemanticStore(pool);
  return {
    handlers: createSemanticCatalogHandlers({
      catalogReader: store,
      resolvePrincipal: resolveActualPrincipal,
    }),
    close: () => pool.end(),
  };
}
