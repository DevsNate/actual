import type { PlanId } from '@actual-app/semantic-core';

export type EntityChangeInput = {
  entityKind: string;
  entityId: string;
  isTombstone: boolean;
  payload: Readonly<Record<string, unknown>>;
};

export type CommitChangeSetInput = {
  changeSetId: string;
  planId: PlanId;
  originDeviceId: string;
  startingDeviceKnowledge: number;
  endingDeviceKnowledge: number;
  expectedServerKnowledge: number;
  schemaVersion: number;
  idempotencyKey: string;
  payloadDigest: string;
  changes: readonly EntityChangeInput[];
  response: Readonly<Record<string, unknown>>;
};

export type CommitChangeSetResult = {
  replayed: boolean;
  serverKnowledge: number;
  endingDeviceKnowledge: number;
  response: Readonly<Record<string, unknown>>;
};

export type CreatePlanInput = {
  planId: PlanId;
  budgetVersionId: string;
  membershipId: string;
  principalId: string;
  name: string;
  permissions: number;
};
