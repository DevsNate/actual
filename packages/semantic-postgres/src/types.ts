import type {
  CatalogCommand,
  CatalogCommandResult,
  CreatePlanCommand,
  CreatePlanResult,
  PlanChangeSetCommand,
  PlanChangeSetResult,
  PlanEntity,
} from '@actual-app/semantic-core';

export type {
  CatalogCommand,
  CatalogCommandResult,
  CreatePlanCommand,
  CreatePlanResult,
  PlanChangeSetCommand,
  PlanChangeSetResult,
};

export type CommitChangeSetInput = PlanChangeSetCommand;

export type CommitChangeSetResult = PlanChangeSetResult;

export type EntityChangeInput = PlanEntity;

export type SeedPlanInput = {
  planId: string;
  budgetVersionId: string;
  membershipId: string;
  principalId: string;
  name: string;
  permissions: number;
};
