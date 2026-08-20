import canonicalAccountDomainSql from '../migrations/0006_canonical_account_domain.sql?raw';

import type { SemanticMigration } from './migrate';

export const semanticCanonicalAccountDomainMigration: SemanticMigration = {
  filename: '0006_canonical_account_domain.sql',
  sql: canonicalAccountDomainSql,
};
