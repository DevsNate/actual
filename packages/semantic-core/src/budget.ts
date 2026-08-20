import type { PrincipalId } from './auth';

export type BudgetEntity = {
  entityKind: string;
  entityId: string;
  isTombstone: boolean;
  payload: Readonly<Record<string, unknown>>;
  /** Server knowledge at which this persisted projection last changed. */
  lastServerKnowledge?: number;
};

export type BudgetChangeSetCommand = {
  changeSetId: string;
  budgetId: string;
  originDeviceId: string;
  startingDeviceKnowledge: number;
  endingDeviceKnowledge: number;
  expectedServerKnowledge: number;
  serverKnowledgeAdvance: 1 | 2;
  schemaVersion: number;
  idempotencyKey: string;
  payloadDigest: string;
  changes: readonly BudgetEntity[];
  response: Readonly<Record<string, unknown>>;
};

export type BudgetChangeSetResult = {
  replayed: boolean;
  serverKnowledge: number;
  endingDeviceKnowledge: number;
  response: Readonly<Record<string, unknown>>;
};

export type BudgetChangeWriter = {
  commitChangeSet(
    command: BudgetChangeSetCommand,
  ): Promise<BudgetChangeSetResult>;
};

export type BudgetDeviceAcknowledgement = {
  budgetId: string;
  originDeviceId: string;
  startingDeviceKnowledge: number;
  endingDeviceKnowledge: number;
  expectedServerKnowledge: number;
  idempotencyKey: string;
  payloadDigest: string;
  response: Readonly<Record<string, unknown>>;
};

export type BudgetDeviceAcknowledgementWriter = {
  acknowledgeDevice(
    command: BudgetDeviceAcknowledgement,
  ): Promise<BudgetChangeSetResult>;
};

export type CreateBudgetCommand = {
  catalogChangeSetId: string;
  budgetChangeSetId: string;
  budgetId: string;
  budgetVersionId: string;
  membershipId: string;
  principalId: PrincipalId;
  originDeviceId: string;
  expectedCatalogServerKnowledge: number;
  schemaVersion: number;
  idempotencyKey: string;
  payloadDigest: string;
  name: string;
  permissions: number;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
  entities: readonly BudgetEntity[];
  receipt: CreatedBudget;
};

export type CreatedBudget = {
  budgetId: string;
  budgetVersionId: string;
};

export type CreateBudgetResult = {
  replayed: boolean;
  catalogServerKnowledge: number;
  budgetServerKnowledge: number;
  budget: CreatedBudget;
};

export type BudgetCreator = {
  createBudget(command: CreateBudgetCommand): Promise<CreateBudgetResult>;
};

export type BudgetSnapshot = {
  budgetId: string;
  budgetVersionId: string;
  name: string;
  serverKnowledge: number;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
  entities: readonly BudgetEntity[];
};

export type BudgetReader = {
  readBudget(
    principalId: PrincipalId,
    budgetId: string,
  ): Promise<BudgetSnapshot | null>;
};

export type BudgetVersionReader = {
  readBudgetByVersion(
    principalId: PrincipalId,
    budgetVersionId: string,
  ): Promise<BudgetSnapshot | null>;
};
