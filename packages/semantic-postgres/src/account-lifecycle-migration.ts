import accountLifecycleSql from '../migrations/0007_account_lifecycle.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticAccountLifecycleMigration: SemanticMigration = {
  filename: '0007_account_lifecycle.sql',
  sql: accountLifecycleSql,
};
