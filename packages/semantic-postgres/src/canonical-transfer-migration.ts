import transferSql from '../migrations/0011_canonical_transfer.sql?raw';

export const semanticCanonicalTransferMigration = {
  filename: '0011_canonical_transfer.sql',
  sql: transferSql,
} as const;
