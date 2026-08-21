import scheduledTransactionSql from '../migrations/0016_canonical_scheduled_transaction.sql?raw';

export const semanticCanonicalScheduledTransactionMigration = {
  filename: '0016_canonical_scheduled_transaction.sql',
  sql: scheduledTransactionSql,
} as const;
