import type { PrincipalId } from './auth';

export type BudgetId = string;
export type BudgetVersionId = string;

export type BudgetMembership = {
  id: string;
  budgetId: BudgetId;
  budgetVersionId: BudgetVersionId;
  principalId: PrincipalId;
  name: string;
  permissions: number;
  lastModifiedAt: string;
  source: string | null;
  isTombstone: boolean;
};

export type CatalogKnowledge = {
  principalId: PrincipalId;
  currentServerKnowledge: number;
};

export type CatalogSnapshot = {
  knowledge: CatalogKnowledge;
  memberships: readonly BudgetMembership[];
};

export type CatalogReader = {
  readCatalog(principalId: PrincipalId): Promise<CatalogSnapshot>;
};

export type CatalogCommandChange = {
  entityKind: string;
  entityId: string;
  isTombstone: boolean;
  payload: Readonly<Record<string, unknown>>;
};

export type CatalogCommand = {
  changeSetId: string;
  principalId: PrincipalId;
  originDeviceId: string;
  startingDeviceKnowledge: number;
  endingDeviceKnowledge: number;
  expectedServerKnowledge: number;
  schemaVersion: number;
  commandKind: string;
  idempotencyKey: string;
  payloadDigest: string;
  changes: readonly CatalogCommandChange[];
  response: Readonly<Record<string, unknown>>;
};

export type CatalogCommandResult = {
  replayed: boolean;
  serverKnowledge: number;
  endingDeviceKnowledge: number;
  response: Readonly<Record<string, unknown>>;
};

export type CatalogCommandWriter = {
  commitCatalogCommand(command: CatalogCommand): Promise<CatalogCommandResult>;
};
