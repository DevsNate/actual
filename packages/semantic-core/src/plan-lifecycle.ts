import type { PrincipalId } from './auth';

type PlanLifecycleCommand = {
  catalogChangeSetId: string;
  principalId: PrincipalId;
  planId: string;
  originDeviceId: string;
  schemaVersion: number;
  idempotencyKey: string;
  payloadDigest: string;
  response: Readonly<Record<string, unknown>>;
};

export type RenamePlanCommand = PlanLifecycleCommand & {
  budgetChangeSetId: string;
  newName: string;
};

export type DeletePlanCommand = PlanLifecycleCommand;

export type PlanLifecycleResult = {
  replayed: boolean;
  catalogServerKnowledge: number;
  budgetServerKnowledge: number | null;
  response: Readonly<Record<string, unknown>>;
};

export type PlanLifecycleWriter = {
  renamePlan(command: RenamePlanCommand): Promise<PlanLifecycleResult>;
  deletePlan(command: DeletePlanCommand): Promise<PlanLifecycleResult>;
};
