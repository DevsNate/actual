import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';

/** Project-owned canonical representation of the captured manual assignment. */
export type CanonicalMoneyMovement = {
  id: string;
  budgetId: string;
  toMonthlyCategoryBudgetId: string;
  fromMonthlyCategoryBudgetId: null;
  movementGroupId: null;
  amount: number;
  performedByPrincipalId: string;
  note: null;
  source: 'manual_assign';
  startedAt: string;
  acceptedAt: string;
};

export type CanonicalCategoryAssignment = {
  kind: 'assign' | 'captured-replay';
  budgetId: string;
  categoryId: string;
  monthlyBudgetId: string;
  monthlyCategoryBudgetId: string;
  expectedBudgeted: number;
  budgeted: number;
  movement: CanonicalMoneyMovement;
};

export type CommitCanonicalCategoryAssignment = {
  assignment: CanonicalCategoryAssignment;
  delivery: BudgetChangeSetCommand;
};

export type CategoryAssignmentWriter = {
  commitCategoryAssignment(
    command: CommitCanonicalCategoryAssignment,
  ): Promise<BudgetChangeSetResult>;
};
