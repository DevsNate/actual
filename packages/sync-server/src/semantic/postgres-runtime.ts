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
import { createPlanCreationService } from './plan-creation-service';
import { createSemanticPlanLifecycleHandlers } from './plan-lifecycle-api';
import { createPlanLifecycleService } from './plan-lifecycle-service';
import { resolveActualPrincipal } from './session-principal-adapter';
import { createStockCatalogGateway } from './stock-catalog-gateway';

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
  const planCreationService = createPlanCreationService({
    catalogReader: store,
    planCreator: store,
  });
  const planLifecycleService = createPlanLifecycleService({
    planLifecycleWriter: lifecycleStore,
  });
  const handlers = createSemanticCatalogHandlers({
    catalogReader: store,
    resolvePrincipal: resolveActualPrincipal,
  });
  handlers.use(
    createSemanticPlanHandlers({
      planCreationService,
      planReader,
      resolvePrincipal: resolveActualPrincipal,
    }),
  );
  handlers.use(
    createSemanticPlanLifecycleHandlers({
      planLifecycleService,
      resolvePrincipal: resolveActualPrincipal,
    }),
  );
  const stockHandlers = createStockCatalogGateway({
    catalogReader: store,
    planReader,
    resolvePrincipal: resolveActualPrincipal,
  });
  return {
    handlers,
    stockHandlers,
    close: () => pool.end(),
  };
}
