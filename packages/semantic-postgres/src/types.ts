import type {
  CatalogCommand,
  CatalogCommandResult,
  CreateBudgetCommand,
  CreateBudgetResult,
  BudgetChangeSetCommand,
  BudgetChangeSetResult,
  BudgetEntity,
} from '@actual-app/semantic-core';

export type {
  CatalogCommand,
  CatalogCommandResult,
  CreateBudgetCommand,
  CreateBudgetResult,
  BudgetChangeSetCommand,
  BudgetChangeSetResult,
};

export type CommitChangeSetInput = BudgetChangeSetCommand;

export type CommitChangeSetResult = BudgetChangeSetResult;

export type EntityChangeInput = BudgetEntity;

export type SeedBudgetInput = {
  budgetId: string;
  budgetVersionId: string;
  membershipId: string;
  principalId: string;
  name: string;
  permissions: number;
};
