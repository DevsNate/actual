import canonicalBudgetEntitySql from '../migrations/0003_canonical_plan_entities.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCanonicalBudgetEntityMigration: SemanticMigration = {
  filename: '0003_canonical_plan_entities.sql',
  sql: canonicalBudgetEntitySql,
};
