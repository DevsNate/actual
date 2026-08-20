import type { PrincipalId } from './auth';

type BudgetLifecycleCommand = {
  catalogChangeSetId: string;
  principalId: PrincipalId;
  budgetId: string;
  originDeviceId: string;
  schemaVersion: number;
  idempotencyKey: string;
  payloadDigest: string;
  receipt: BudgetLifecycleReceipt;
  catalogDeviceKnowledge?: DeviceKnowledgeRange;
};

export type BudgetLifecycleReceipt =
  | { budgetId: string; kind: 'renamed'; name: string }
  | { budgetId: string; kind: 'deleted' };

export type RenameBudgetCommand = BudgetLifecycleCommand & {
  budgetChangeSetId: string;
  newName: string;
  budgetDeviceKnowledge?: DeviceKnowledgeRange;
};

export type DeleteBudgetCommand = BudgetLifecycleCommand;

export type BudgetLifecycleResult = {
  replayed: boolean;
  catalogServerKnowledge: number;
  budgetServerKnowledge: number | null;
  budget: BudgetLifecycleReceipt;
};

export type BudgetLifecycleWriter = {
  renameBudget(command: RenameBudgetCommand): Promise<BudgetLifecycleResult>;
  deleteBudget(command: DeleteBudgetCommand): Promise<BudgetLifecycleResult>;
};

export type DeviceKnowledgeRange = {
  starting: number;
  ending: number;
};
