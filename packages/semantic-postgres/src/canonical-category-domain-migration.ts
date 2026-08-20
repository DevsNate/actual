import categoryDomainSql from '../migrations/0008_canonical_category_domain.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCanonicalCategoryDomainMigration: SemanticMigration = {
  filename: '0008_canonical_category_domain.sql',
  sql: categoryDomainSql,
};
