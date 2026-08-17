import type { PrincipalId } from './auth';

export type PlanId = string;
export type BudgetVersionId = string;

export type PlanMembership = {
  id: string;
  planId: PlanId;
  budgetVersionId: BudgetVersionId;
  principalId: PrincipalId;
  name: string;
  permissions: number;
  isTombstone: boolean;
};

export type CatalogKnowledge = {
  principalId: PrincipalId;
  currentServerKnowledge: number;
};

export type CatalogSnapshot = {
  knowledge: CatalogKnowledge;
  memberships: readonly PlanMembership[];
};

export type CatalogReader = {
  readCatalog(principalId: PrincipalId): Promise<CatalogSnapshot>;
};
