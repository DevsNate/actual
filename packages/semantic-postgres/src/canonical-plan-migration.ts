import canonicalPlanSql from '../migrations/0003_canonical_plan_entities.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCanonicalPlanMigration: SemanticMigration = {
  filename: '0003_canonical_plan_entities.sql',
  sql: canonicalPlanSql,
};
