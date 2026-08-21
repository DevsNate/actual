import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';

import type {
  StockBudgetCalculationEntities,
  StockMonthlyBudgetCalculation,
  StockMonthlySubcategoryBudgetCalculation,
} from './stock-calculation-entities';

const calculationSensitiveKinds = new Set([
  'be_accounts',
  'be_expected_income',
  'be_scheduled_subtransactions',
  'be_scheduled_transactions',
  'be_subtransactions',
  'be_transactions',
]);

export function projectStockFreshBudgetCalculations(
  snapshot: BudgetSnapshot,
): StockBudgetCalculationEntities {
  assertPristineBudget(snapshot.entities);

  const monthlyBudgets = entitiesOfKind(
    snapshot.entities,
    'be_monthly_budgets',
  ).filter(
    entity => entity.payload.bootstrapRole !== 'opened-budget-prior-month',
  );
  const monthlyCategoryBudgets = entitiesOfKind(
    snapshot.entities,
    'be_monthly_subcategory_budgets',
  );
  const monthlyBudgetIds = new Set(
    monthlyBudgets.map(entity => entity.entityId),
  );

  return {
    be_monthly_budget_calculations: monthlyBudgets.map(projectMonthlyBudget),
    be_monthly_subcategory_budget_calculations: monthlyCategoryBudgets.map(
      entity => projectMonthlyCategoryBudget(entity, monthlyBudgetIds),
    ),
    be_account_calculations: [],
    be_monthly_account_calculations: [],
  };
}

function assertPristineBudget(entities: readonly BudgetEntity[]): void {
  for (const entity of entities) {
    if (entity.isTombstone) {
      throw new Error('Fresh-budget calculations do not accept tombstones');
    }
    if (calculationSensitiveKinds.has(entity.entityKind)) {
      throw new Error(
        `Fresh-budget calculations do not support ${entity.entityKind}`,
      );
    }
    if (
      entity.entityKind === 'be_monthly_subcategory_budgets' &&
      entity.payload.budgeted !== 0
    ) {
      throw new Error(
        'Fresh-budget calculations require zero budgeted amounts',
      );
    }
  }
}

function projectMonthlyBudget(
  entity: BudgetEntity,
): StockMonthlyBudgetCalculation {
  const id = replaceIdentityPrefix(entity.entityId, 'mb/', 'mbc/');
  return {
    id,
    entities_monthly_budget_id: entity.entityId,
    is_tombstone: false,
    immediate_income: 0,
    budgeted: 0,
    cash_outflows: 0,
    credit_outflows: 0,
    balance: 0,
    over_spent: 0,
    available_to_budget: 0,
    uncategorized_cash_outflows: 0,
    uncategorized_credit_outflows: 0,
    uncategorized_balance: 0,
    additional_to_be_budgeted: 0,
    age_of_money: null,
    previous_income: 0,
    deferred_income: 0,
    hidden_budgeted: 0,
    hidden_cash_outflows: 0,
    hidden_credit_outflows: 0,
    hidden_balance: 0,
  };
}

function projectMonthlyCategoryBudget(
  entity: BudgetEntity,
  monthlyBudgetIds: ReadonlySet<string>,
): StockMonthlySubcategoryBudgetCalculation {
  const monthlyBudgetId = requireString(
    entity.payload.monthlyBudgetId,
    'monthlyBudgetId',
  );
  if (!monthlyBudgetIds.has(monthlyBudgetId)) {
    throw new Error('Monthly category calculation references an unknown month');
  }
  const categoryId = requireString(
    entity.payload.subCategoryId,
    'subCategoryId',
  );
  const id = replaceIdentityPrefix(entity.entityId, 'mcb/', 'mcbc/');
  if (!id.endsWith(`/${categoryId}`)) {
    throw new Error('Monthly category identity does not match its category');
  }

  return {
    id,
    entities_monthly_subcategory_budget_id: entity.entityId,
    is_tombstone: false,
    cash_outflows: 0,
    positive_cash_outflows: 0,
    credit_outflows: 0,
    balance: 0,
    budgeted_cash_outflows: 0,
    budgeted_credit_outflows: 0,
    unbudgeted_cash_outflows: 0,
    unbudgeted_credit_outflows: 0,
    budgeted_previous_month: 0,
    spent_previous_month: 0,
    payment_previous_month: 0,
    balance_previous_month: 0,
    budgeted_average: null,
    spent_average: null,
    payment_average: null,
    budgeted_spending: null,
    all_spending: null,
    all_spending_since_last_payment: null,
    additional_to_be_budgeted: null,
    upcoming_transactions: 0,
    upcoming_transactions_count: 0,
    upcoming_transactions_first_date: null,
    goal_overall_funded: null,
    goal_overall_outflows: 0,
    goal_under_funded: null,
    goal_target: 0,
    goal_overall_left: null,
    goal_expected_completion: null,
    goal_percentage_complete: null,
    overspending_affects_buffer: true,
  };
}

function entitiesOfKind(
  entities: readonly BudgetEntity[],
  entityKind: string,
): readonly BudgetEntity[] {
  return entities
    .filter(entity => entity.entityKind === entityKind)
    .sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function replaceIdentityPrefix(
  identity: string,
  sourcePrefix: string,
  calculationPrefix: string,
): string {
  if (!identity.startsWith(sourcePrefix)) {
    throw new Error(`Invalid stock source identity: ${identity}`);
  }
  return `${calculationPrefix}${identity.slice(sourcePrefix.length)}`;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Fresh-budget calculation requires ${field}`);
  }
  return value;
}
