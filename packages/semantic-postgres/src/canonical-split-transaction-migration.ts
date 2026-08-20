import splitTransactionSql from '../migrations/0010_canonical_split_transaction.sql?raw';

export const semanticCanonicalSplitTransactionMigration = {
  filename: '0010_canonical_split_transaction.sql',
  sql: splitTransactionSql,
} as const;
