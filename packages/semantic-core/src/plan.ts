import type { PrincipalId } from './auth';

export type PlanEntity = {
  entityKind: string;
  entityId: string;
  isTombstone: boolean;
  payload: Readonly<Record<string, unknown>>;
};

export type CreatePlanCommand = {
  catalogChangeSetId: string;
  budgetChangeSetId: string;
  planId: string;
  budgetVersionId: string;
  membershipId: string;
  principalId: PrincipalId;
  originDeviceId: string;
  expectedCatalogServerKnowledge: number;
  startingCatalogDeviceKnowledge: number;
  endingCatalogDeviceKnowledge: number;
  schemaVersion: number;
  idempotencyKey: string;
  payloadDigest: string;
  name: string;
  permissions: number;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
  entities: readonly PlanEntity[];
  response: Readonly<Record<string, unknown>>;
};

export type CreatePlanResult = {
  replayed: boolean;
  catalogServerKnowledge: number;
  budgetServerKnowledge: number;
  response: Readonly<Record<string, unknown>>;
};

export type PlanCreator = {
  createPlan(command: CreatePlanCommand): Promise<CreatePlanResult>;
};

export type PlanSnapshot = {
  planId: string;
  budgetVersionId: string;
  name: string;
  serverKnowledge: number;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
  entities: readonly PlanEntity[];
};

export type PlanReader = {
  readPlan(
    principalId: PrincipalId,
    planId: string,
  ): Promise<PlanSnapshot | null>;
};

export type BudgetVersionPlanReader = {
  readPlanByBudgetVersion(
    principalId: PrincipalId,
    budgetVersionId: string,
  ): Promise<PlanSnapshot | null>;
};
