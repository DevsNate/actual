import type { PlanEntity, PlanSnapshot } from '@actual-app/semantic-core';

export type StockBudgetSourceProjection = {
  changedEntities: Readonly<Record<string, unknown>>;
  firstMonth: string | null;
  lastMonth: string | null;
};

export function projectStockBudgetSource(
  snapshot: PlanSnapshot,
): StockBudgetSourceProjection {
  const grouped = new Map<string, Array<Readonly<Record<string, unknown>>>>();
  for (const entity of snapshot.entities) {
    if (!/^be_[a-z0-9_]+$/u.test(entity.entityKind)) {
      throw new Error(
        `Unsupported stock budget entity kind: ${entity.entityKind}`,
      );
    }
    const rows = grouped.get(entity.entityKind) ?? [];
    rows.push(projectStockEntity(entity));
    grouped.set(entity.entityKind, rows);
  }

  const budgetRows = grouped.get('be_budget') ?? [];
  if (budgetRows.length !== 1) {
    throw new Error('A stock budget projection requires exactly one be_budget');
  }

  const changedEntities: Record<string, unknown> = {};
  for (const [entityKind, rows] of [...grouped].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    changedEntities[entityKind] = entityKind === 'be_budget' ? rows[0] : rows;
  }

  const months = snapshot.entities
    .filter(
      entity =>
        entity.entityKind === 'be_monthly_budgets' &&
        entity.payload.bootstrapRole !== 'opened-budget-prior-month',
    )
    .map(entity => entity.payload.month)
    .filter((month): month is string => typeof month === 'string')
    .sort();
  const bootstrapMonth = months[0] ?? null;
  return {
    changedEntities,
    firstMonth: bootstrapMonth,
    lastMonth: bootstrapMonth,
  };
}

export function projectStockEntity(
  entity: PlanEntity,
): Readonly<Record<string, unknown>> {
  const payload = projectPayload(entity.entityKind, entity.payload);
  if ('id' in payload || 'is_tombstone' in payload) {
    throw new Error(
      'Canonical entity payload collides with stock identity fields',
    );
  }
  return {
    ...payload,
    id: entity.entityId,
    is_tombstone: entity.isTombstone,
  };
}

const payloadRules: Readonly<
  Record<
    string,
    {
      omit: ReadonlySet<string>;
      rename?: Readonly<Record<string, string>>;
    }
  >
> = {
  be_accounts: rule(['budgetVersionId', 'creationCommandKey']),
  be_budget: rule(['budgetVersionId', 'deviceKnowledge']),
  be_master_categories: rule(['budgetVersionId', 'deviceKnowledge']),
  be_monthly_budgets: rule([
    'budgetVersionId',
    'bootstrapRole',
    'deviceKnowledge',
  ]),
  be_monthly_subcategory_budgets: rule(
    ['budgetVersionId', 'deviceKnowledge', 'month'],
    {
      monthlyBudgetId: 'entities_monthly_budget_id',
      subCategoryId: 'entities_subcategory_id',
    },
  ),
  be_onboarding_events: rule(['budgetVersionId']),
  be_payees: rule(['budgetVersionId', 'deviceKnowledge'], {
    accountId: 'entities_account_id',
    autoFillSubCategoryEnabled: 'auto_fill_subcategory_enabled',
    autoFillSubCategoryId: 'auto_fill_subcategory_id',
  }),
  be_settings: rule(['budgetVersionId', 'deviceKnowledge']),
  be_subcategories: rule(
    ['budgetVersionId', 'deviceKnowledge', 'pinnedGoalIndex', 'pinnedIndex'],
    {
      accountId: 'entities_account_id',
      masterCategoryId: 'entities_master_category_id',
    },
  ),
  be_transactions: rule(['budgetVersionId'], {
    accountId: 'entities_account_id',
    payeeId: 'entities_payee_id',
    subCategoryId: 'entities_subcategory_id',
    scheduledTransactionId: 'entities_scheduled_transaction_id',
  }),
};

function projectPayload(
  entityKind: string,
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const rule = payloadRules[entityKind];
  if (!rule) {
    return snakeCaseRecord(payload);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (rule.omit.has(key)) {
      continue;
    }
    const projectedKey = rule.rename?.[key] ?? snakeCase(key);
    if (projectedKey in result) {
      throw new Error(`Stock field projection collision: ${projectedKey}`);
    }
    result[projectedKey] = projectValue(value);
  }
  return result;
}

function rule(
  omitted: readonly string[],
  rename?: Readonly<Record<string, string>>,
) {
  return { omit: new Set(omitted), rename };
}

function snakeCaseRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const projectedKey = snakeCase(key);
    if (projectedKey in result) {
      throw new Error(`Stock field projection collision: ${projectedKey}`);
    }
    result[projectedKey] = projectValue(item);
  }
  return result;
}

function projectValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(projectValue);
  }
  if (isRecord(value)) {
    return snakeCaseRecord(value);
  }
  return value;
}

function snakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').toLowerCase();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
