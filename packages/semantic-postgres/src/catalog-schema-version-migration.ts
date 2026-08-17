import catalogSchemaVersionSql from '../migrations/0004_catalog_command_schema_version.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCatalogSchemaVersionMigration: SemanticMigration = {
  filename: '0004_catalog_command_schema_version.sql',
  sql: catalogSchemaVersionSql,
};
