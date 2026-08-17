import catalogCommandSql from '../migrations/0002_catalog_command_ledger.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCatalogCommandMigration: SemanticMigration = {
  filename: '0002_catalog_command_ledger.sql',
  sql: catalogCommandSql,
};
