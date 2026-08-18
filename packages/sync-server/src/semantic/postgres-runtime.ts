import {
  migrateSemanticDatabase,
  PostgresPlanLifecycleStore,
  PostgresPlanReader,
  PostgresSemanticStore,
} from '@actual-app/semantic-postgres';
import { semanticCanonicalPlanMigration } from '@actual-app/semantic-postgres/canonical-plan-migration';
import { semanticCatalogCommandMigration } from '@actual-app/semantic-postgres/catalog-command-migration';
import { semanticCatalogSchemaVersionMigration } from '@actual-app/semantic-postgres/catalog-schema-version-migration';
import { semanticFoundationMigration } from '@actual-app/semantic-postgres/foundation-migration';
import { Pool } from 'pg';

import { createSemanticCatalogHandlers } from './catalog-api';
import { createSemanticPlanHandlers } from './plan-api';
import { createSemanticPlanLifecycleHandlers } from './plan-lifecycle-api';
import { resolveActualPrincipal } from './session-principal-adapter';

export async function createPostgresSemanticCatalogHandlers(
  databaseUrl: string,
) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrateSemanticDatabase(pool, [
      semanticFoundationMigration,
      semanticCatalogCommandMigration,
      semanticCanonicalPlanMigration,
      semanticCatalogSchemaVersionMigration,
    ]);
  } catch (error) {
    await pool.end();
    throw error;
  }

  const store = new PostgresSemanticStore(pool);
  const lifecycleStore = new PostgresPlanLifecycleStore(pool);
  const planReader = new PostgresPlanReader(pool);
  const handlers = createSemanticCatalogHandlers({
    catalogReader: store,
    resolvePrincipal: resolveActualPrincipal,
  });
  handlers.use(
    createSemanticPlanHandlers({
      catalogReader: store,
      planCreator: store,
      planReader,
      resolvePrincipal: resolveActualPrincipal,
    }),
  );
  handlers.use(
    createSemanticPlanLifecycleHandlers({
      planLifecycleWriter: lifecycleStore,
      resolvePrincipal: resolveActualPrincipal,
    }),
  );
  return {
    handlers,
    close: () => pool.end(),
  };
}
