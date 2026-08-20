import ordinaryTransactionSql from '../migrations/0009_canonical_ordinary_transaction.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCanonicalOrdinaryTransactionMigration: SemanticMigration =
  {
    filename: '0009_canonical_ordinary_transaction.sql',
    sql: ordinaryTransactionSql,
  };
