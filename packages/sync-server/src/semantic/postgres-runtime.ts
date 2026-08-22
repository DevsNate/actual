import {
  migrateSemanticDatabase,
  PostgresBudgetLifecycleStore,
  PostgresBudgetReader,
  PostgresSemanticStore,
} from '@actual-app/semantic-postgres';
import { semanticAccountLifecycleMigration } from '@actual-app/semantic-postgres/account-lifecycle-migration';
import { semanticBudgetIdentitySchemaMigration } from '@actual-app/semantic-postgres/budget-identity-schema-migration';
import { semanticCanonicalAccountDomainMigration } from '@actual-app/semantic-postgres/canonical-account-domain-migration';
import { semanticCanonicalBudgetBootstrapMigration } from '@actual-app/semantic-postgres/canonical-budget-bootstrap-migration';
import { semanticCanonicalBudgetEntityMigration } from '@actual-app/semantic-postgres/canonical-budget-entity-migration';
import { semanticCanonicalCategoryDomainMigration } from '@actual-app/semantic-postgres/canonical-category-domain-migration';
import { semanticCanonicalCreditCardAccountMigration } from '@actual-app/semantic-postgres/canonical-credit-card-account-migration';
import { semanticCanonicalCreditCardPaymentMigration } from '@actual-app/semantic-postgres/canonical-credit-card-payment-migration';
import { semanticCanonicalMonthlyBudgetIdentityMigration } from '@actual-app/semantic-postgres/canonical-monthly-budget-identity-migration';
import { semanticCanonicalOrdinaryTransactionMigration } from '@actual-app/semantic-postgres/canonical-ordinary-transaction-migration';
import { semanticCanonicalScheduledTransactionMigration } from '@actual-app/semantic-postgres/canonical-scheduled-transaction-migration';
import { semanticCanonicalSplitTransactionMigration } from '@actual-app/semantic-postgres/canonical-split-transaction-migration';
import { semanticCanonicalTargetDefinitionMigration } from '@actual-app/semantic-postgres/canonical-target-definition-migration';
import { semanticCanonicalTransferMigration } from '@actual-app/semantic-postgres/canonical-transfer-migration';
import { semanticCatalogCommandMigration } from '@actual-app/semantic-postgres/catalog-command-migration';
import { semanticCatalogSchemaVersionMigration } from '@actual-app/semantic-postgres/catalog-schema-version-migration';
import { semanticFoundationMigration } from '@actual-app/semantic-postgres/foundation-migration';
import { shortBudgetVersionIdentityMigration } from '@actual-app/semantic-postgres/short-budget-version-identity-migration';
import { Pool } from 'pg';

import { createSemanticAccountHandlers } from './account-api';
import { stockAccountBudgetEntityAdapter } from './account-budget-entity-adapter';
import { createAccountCreationService } from './account-creation-service';
import { createSemanticBudgetHandlers } from './budget-api';
import { createBudgetCreationService } from './budget-creation-service';
import { createSemanticBudgetLifecycleHandlers } from './budget-lifecycle-api';
import { createBudgetLifecycleService } from './budget-lifecycle-service';
import { createSemanticCatalogHandlers } from './catalog-api';
import { resolveActualPrincipal } from './session-principal-adapter';
import { createStockAccountGateway } from './stock-account-gateway';
import { createStockBudgetGateway } from './stock-budget-lifecycle-gateway';
import { createStockCatalogGateway } from './stock-catalog-gateway';
import { createStockUserGateway } from './stock-user-gateway';

export async function createPostgresSemanticCatalogHandlers(
  databaseUrl: string,
) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrateSemanticDatabase(pool, [
      semanticFoundationMigration,
      semanticCatalogCommandMigration,
      semanticCanonicalBudgetEntityMigration,
      semanticCatalogSchemaVersionMigration,
      semanticBudgetIdentitySchemaMigration,
      semanticCanonicalAccountDomainMigration,
      semanticAccountLifecycleMigration,
      semanticCanonicalCategoryDomainMigration,
      semanticCanonicalOrdinaryTransactionMigration,
      semanticCanonicalSplitTransactionMigration,
      semanticCanonicalTransferMigration,
      semanticCanonicalTargetDefinitionMigration,
      semanticCanonicalCreditCardPaymentMigration,
      semanticCanonicalCreditCardAccountMigration,
      semanticCanonicalScheduledTransactionMigration,
      semanticCanonicalBudgetBootstrapMigration,
      semanticCanonicalMonthlyBudgetIdentityMigration,
      shortBudgetVersionIdentityMigration,
    ]);
  } catch (error) {
    await pool.end();
    throw error;
  }

  const store = new PostgresSemanticStore(pool);
  const lifecycleStore = new PostgresBudgetLifecycleStore(pool);
  const budgetReader = new PostgresBudgetReader(pool);
  const budgetCreationService = createBudgetCreationService({
    catalogReader: store,
    budgetCreator: store,
  });
  const accountCreationService = createAccountCreationService({
    budgetReader,
    accountWriter: store,
    entityAdapter: stockAccountBudgetEntityAdapter,
  });
  const budgetLifecycleService = createBudgetLifecycleService({
    budgetLifecycleWriter: lifecycleStore,
  });
  const handlers = createSemanticCatalogHandlers({
    catalogReader: store,
    resolvePrincipal: resolveActualPrincipal,
  });
  handlers.use(
    createSemanticBudgetHandlers({
      budgetCreationService,
      budgetReader,
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
    createSemanticBudgetLifecycleHandlers({
      budgetLifecycleService,
      resolvePrincipal: resolveActualPrincipal,
    }),
  );
  const stockHandlers = createStockCatalogGateway({
    catalogReader: store,
    catalogWriter: store,
    budgetReader,
    changeWriter: store,
    budgetLifecycleService,
    resolvePrincipal: resolveActualPrincipal,
  });
  const stockAccountHandlers = createStockAccountGateway({
    accountCreationService,
    budgetReader,
    resolvePrincipal: resolveActualPrincipal,
  });
  const stockBudgetLifecycleHandlers = createStockBudgetGateway({
    budgetCreationService,
    resolvePrincipal: resolveActualPrincipal,
  });
  const stockUserHandlers = createStockUserGateway({
    resolvePrincipal: resolveActualPrincipal,
  });
  return {
    handlers,
    stockHandlers,
    stockAccountHandlers,
    stockBudgetLifecycleHandlers,
    stockUserHandlers,
    close: () => pool.end(),
  };
}
