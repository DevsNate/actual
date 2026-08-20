import budgetIdentitySchemaSql from '../migrations/0005_budget_identity_schema.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticBudgetIdentitySchemaMigration: SemanticMigration = {
  filename: '0005_budget_identity_schema.sql',
  sql: budgetIdentitySchemaSql,
};
