import type { BudgetSnapshot } from '@actual-app/semantic-core';

import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';
import {
  projectStockBudgetSource,
  projectStockEntity,
} from './stock-budget-projection';

const bootstrapArrayTables = [
  'be_account_calculations',
  'be_account_mappings',
  'be_accounts',
  'be_expected_income',
  'be_master_categories',
  'be_monthly_account_calculations',
  'be_monthly_budget_calculations',
  'be_monthly_budgets',
  'be_monthly_subcategory_budget_calculations',
  'be_monthly_subcategory_budgets',
  'be_onboarding_events',
  'be_onboarding_targets',
  'be_payee_rename_conditions',
  'be_payees',
  'be_scheduled_subtransactions',
  'be_scheduled_transactions',
  'be_settings',
  'be_subcategories',
  'be_subtransactions',
  'be_transaction_images',
  'be_transactions',
] as const;

const backfillArrayTables = [
  'be_money_movement_groups',
  'be_money_movements',
  'be_monthly_account_calculations',
  'be_monthly_budget_calculations',
  'be_monthly_budgets',
  'be_monthly_subcategory_budget_calculations',
  'be_monthly_subcategory_budgets',
  'be_payee_locations',
  'be_subtransactions',
  'be_transaction_images',
  'be_transactions',
] as const;

const deltaArrayTables = [
  'be_account_calculations',
  'be_account_mappings',
  'be_accounts',
  'be_master_categories',
  'be_money_movement_groups',
  'be_money_movements',
  'be_monthly_account_calculations',
  'be_monthly_budget_calculations',
  'be_monthly_budgets',
  'be_monthly_subcategory_budget_calculations',
  'be_monthly_subcategory_budgets',
  'be_onboarding_events',
  'be_onboarding_targets',
  'be_payee_locations',
  'be_payee_rename_conditions',
  'be_payees',
  'be_scheduled_subtransactions',
  'be_scheduled_transactions',
  'be_settings',
  'be_subcategories',
  'be_subtransactions',
  'be_transaction_images',
  'be_transactions',
] as const;

export function buildStockBudgetBootstrap(
  snapshot: BudgetSnapshot,
): Readonly<Record<string, unknown>> {
  const source = projectStockBudgetSource(snapshot);
  if (!source.firstMonth || !source.lastMonth) {
    throw new Error('Stock budget bootstrap requires a current month');
  }
  const calculations = projectStockBudgetCalculations(snapshot);
  const allowedSourceTables = new Set<string>([
    'be_budget',
    ...bootstrapArrayTables,
    'be_money_movement_groups',
    'be_money_movements',
  ]);
  for (const table of Object.keys(source.changedEntities)) {
    if (!allowedSourceTables.has(table)) {
      throw new Error(`Unsupported stock bootstrap table: ${table}`);
    }
  }

  const changedEntities: Record<string, unknown> = {};
  for (const table of bootstrapArrayTables) {
    changedEntities[table] =
      calculations[table as keyof typeof calculations] ??
      source.changedEntities[table] ??
      [];
  }
  changedEntities.be_budget = source.changedEntities.be_budget;
  changedEntities.first_month = source.firstMonth;
  changedEntities.last_month = source.lastMonth;
  return changedEntities;
}

export function buildStockBudgetBackfill(
  snapshot: BudgetSnapshot,
): Readonly<Record<string, unknown>> {
  const source = projectStockBudgetSource(snapshot);
  if (!source.firstMonth || !source.lastMonth) {
    throw new Error('Stock budget backfill requires a current month');
  }
  const calculations = projectStockBudgetCalculations(snapshot);
  const result: Record<string, unknown> = {};
  for (const table of backfillArrayTables) {
    result[table] =
      calculations[table as keyof typeof calculations] ??
      source.changedEntities[table] ??
      [];
  }
  result.first_month = source.firstMonth;
  result.last_month = source.lastMonth;
  return result;
}

export function buildStockBudgetEmptyDelta(
  snapshot: BudgetSnapshot,
): Readonly<Record<string, unknown>> {
  const source = projectStockBudgetSource(snapshot);
  if (!source.firstMonth || !source.lastMonth) {
    throw new Error('Stock budget delta requires a current month');
  }
  return {
    ...Object.fromEntries(deltaArrayTables.map(table => [table, []])),
    be_budget: null,
    be_expected_income: null,
    first_month: source.firstMonth,
    last_month: source.lastMonth,
  };
}

const calculationSensitiveKinds = new Set([
  'be_accounts',
  'be_expected_income',
  'be_scheduled_subtransactions',
  'be_scheduled_transactions',
  'be_subtransactions',
  'be_transactions',
]);
const deltaArrayTableSet = new Set<string>(deltaArrayTables);

export function buildStockBudgetReadDelta(
  snapshot: BudgetSnapshot,
  afterServerKnowledge: number,
): Readonly<Record<string, unknown>> {
  const changed = snapshot.entities.filter(entity => {
    if (entity.lastServerKnowledge === undefined) {
      throw new Error('Stock delta projection requires entity knowledge');
    }
    return entity.lastServerKnowledge > afterServerKnowledge;
  });
  const result = {
    ...buildStockBudgetEmptyDelta(snapshot),
  } as Record<string, unknown>;

  for (const entity of changed) {
    if (entity.entityKind === 'be_budget') {
      result.be_budget = projectStockEntity(entity);
      continue;
    }
    if (!deltaArrayTableSet.has(entity.entityKind)) {
      throw new Error(`Unsupported stock delta table: ${entity.entityKind}`);
    }
    const rows = result[entity.entityKind];
    if (!Array.isArray(rows)) {
      throw new Error(
        `Stock delta table is not an array: ${entity.entityKind}`,
      );
    }
    rows.push(projectStockEntity(entity));
  }

  if (
    changed.some(entity => calculationSensitiveKinds.has(entity.entityKind))
  ) {
    Object.assign(result, projectStockBudgetCalculations(snapshot));
  }
  return result;
}
