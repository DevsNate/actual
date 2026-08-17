import foundationSql from '../migrations/0001_semantic_foundation.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticFoundationMigration: SemanticMigration = {
  filename: '0001_semantic_foundation.sql',
  sql: foundationSql,
};
