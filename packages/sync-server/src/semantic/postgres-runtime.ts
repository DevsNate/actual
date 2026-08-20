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

import { createSemanticAccountHandlers } from './account-api';
import { createAccountCreationService } from './account-creation-service';
import { createSemanticCatalogHandlers } from './catalog-api';
import { createSemanticPlanHandlers } from './plan-api';
import { createPlanCreationService } from './plan-creation-service';
import { createSemanticPlanLifecycleHandlers } from './plan-lifecycle-api';
import { createPlanLifecycleService } from './plan-lifecycle-service';
import { resolveActualPrincipal } from './session-principal-adapter';
import { createStockAccountGateway } from './stock-account-gateway';
import { createStockCatalogGateway } from './stock-catalog-gateway';
import { createStockPlanGateway } from './stock-plan-gateway';
import { createStockUserGateway } from './stock-user-gateway';

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
  const accountCreationService = createAccountCreationService({
    planReader,
    changeWriter: store,
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
    createSemanticAccountHandlers({
      accountCreationService,
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
    catalogWriter: store,
    planReader,
    changeWriter: store,
    resolvePrincipal: resolveActualPrincipal,
  });
  const stockAccountHandlers = createStockAccountGateway({
    accountCreationService,
    resolvePrincipal: resolveActualPrincipal,
  });
  const stockPlanHandlers = createStockPlanGateway({
    planCreationService,
    resolvePrincipal: resolveActualPrincipal,
  });
  const stockUserHandlers = createStockUserGateway({
    resolvePrincipal: resolveActualPrincipal,
  });
  return {
    handlers,
    stockHandlers,
    stockAccountHandlers,
    stockPlanHandlers,
    stockUserHandlers,
    close: () => pool.end(),
  };
}
