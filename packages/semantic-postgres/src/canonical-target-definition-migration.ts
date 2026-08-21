import targetDefinitionSql from '../migrations/0012_canonical_target_definition.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCanonicalTargetDefinitionMigration: SemanticMigration = {
  filename: '0012_canonical_target_definition.sql',
  sql: targetDefinitionSql,
};
