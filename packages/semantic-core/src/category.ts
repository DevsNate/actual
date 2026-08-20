import type { BudgetChangeSetCommand, BudgetChangeSetResult } from './budget';

export type CanonicalCategoryGroupReference = {
  id: string;
  budgetId: string;
  name: string;
  sortOrder: number;
  isHidden: boolean;
};

export type CanonicalCategory = {
  id: string;
  budgetId: string;
  groupId: string;
  name: string;
  sortOrder: number;
  type: 'DFT';
  note: null;
  isHidden: boolean;
};

export type CanonicalMonthlyCategoryBudget = {
  id: string;
  budgetId: string;
  categoryId: string;
  month: string;
  budgeted: 0;
  goalSnoozedAt: null;
  note: null;
  overspendingHandling: 'AffectsBuffer';
};

export type CanonicalCategoryMutation =
  | {
      kind: 'create';
      group: CanonicalCategoryGroupReference;
      category: CanonicalCategory;
      months: readonly [
        CanonicalMonthlyCategoryBudget,
        CanonicalMonthlyCategoryBudget,
      ];
    }
  | {
      kind: 'update';
      budgetId: string;
      categoryId: string;
      expectedGroupId: string;
      expectedName: string;
      expectedSortOrder: number;
      expectedHidden: boolean;
      groupId: string;
      name: string;
      sortOrder: number;
      isHidden: boolean;
    }
  | {
      kind: 'delete';
      budgetId: string;
      categoryId: string;
      monthlyCategoryBudgetIds: readonly [string, string];
    };

export type CommitCanonicalCategoryMutation = {
  mutation: CanonicalCategoryMutation;
  delivery: BudgetChangeSetCommand;
};

export type CategoryMutationWriter = {
  commitCategoryMutation(
    command: CommitCanonicalCategoryMutation,
  ): Promise<BudgetChangeSetResult>;
};
