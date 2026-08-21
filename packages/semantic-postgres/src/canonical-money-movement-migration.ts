import moneyMovementSql from '../migrations/0013_canonical_money_movement.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCanonicalMoneyMovementMigration: SemanticMigration = {
  filename: '0013_canonical_money_movement.sql',
  sql: moneyMovementSql,
};
