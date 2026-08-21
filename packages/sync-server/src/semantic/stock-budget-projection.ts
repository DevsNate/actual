import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';

export type StockBudgetSourceProjection = {
  changedEntities: Readonly<Record<string, unknown>>;
  firstMonth: string | null;
  lastMonth: string | null;
};

export function projectStockBudgetSource(
  snapshot: BudgetSnapshot,
): StockBudgetSourceProjection {
  const grouped = new Map<string, Array<Readonly<Record<string, unknown>>>>();
  for (const entity of snapshot.entities) {
    if (!/^be_[a-z0-9_]+$/u.test(entity.entityKind)) {
      throw new Error(
        `Unsupported stock budget entity kind: ${entity.entityKind}`,
      );
    }
    const rows = grouped.get(entity.entityKind) ?? [];
    rows.push(projectStockResponseEntity(entity));
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

export function projectStockRequestEntity(
  entity: BudgetEntity,
): Readonly<Record<string, unknown>> {
  const payload = projectEntityPayload(entity.entityKind, entity.payload);
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

export function projectStockResponseEntity(
  entity: BudgetEntity,
): Readonly<Record<string, unknown>> {
  const projected = projectStockRequestEntity(entity);
  if (entity.entityKind !== 'be_scheduled_transactions') {
    return projected;
  }
  const upcoming = projected.upcoming_instances;
  const match =
    typeof upcoming === 'string'
      ? /^\{(\d{4}-\d{2}-\d{2})\}$/u.exec(upcoming)
      : null;
  if (!match) {
    throw new Error('Stock schedule response requires one upcoming date');
  }
  return { ...projected, upcoming_instances: [match[1]] };
}

function projectEntityPayload(
  entityKind: string,
  payload: Readonly<Record<string, unknown>>,
) {
  const projected = projectPayload(entityKind, payload);
  if (entityKind === 'be_scheduled_transactions') {
    const upcoming = projected.upcoming_instances;
    if (
      !Array.isArray(upcoming) ||
      upcoming.length !== 1 ||
      typeof upcoming[0] !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(upcoming[0])
    ) {
      throw new Error('Stock schedule projection requires one upcoming date');
    }
    return { ...projected, upcoming_instances: `{${upcoming[0]}}` };
  }
  if (entityKind !== 'be_budget') {
    return projected;
  }
  const currencyFormat = projected.currency_format;
  const dateFormat = projected.date_format;
  if (
    (currencyFormat !== undefined && !isRecord(currencyFormat)) ||
    (dateFormat !== undefined && !isRecord(dateFormat))
  ) {
    throw new Error('Stock budget formats must be structured canonical values');
  }
  return {
    ...projected,
    ...(currencyFormat === undefined
      ? {}
      : { currency_format: JSON.stringify(currencyFormat) }),
    ...(dateFormat === undefined
      ? {}
      : { date_format: JSON.stringify(dateFormat) }),
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
  be_money_movements: rule([], {
    toMonthlyCategoryBudgetId: 'to_entities_monthly_subcategory_budget_id',
    fromMonthlyCategoryBudgetId: 'from_entities_monthly_subcategory_budget_id',
    movementGroupId: 'entities_money_movement_group_id',
  }),
  be_onboarding_events: rule(['budgetVersionId']),
  be_payees: rule(['budgetVersionId', 'deviceKnowledge'], {
    accountId: 'entities_account_id',
    autoFillSubCategoryEnabled: 'auto_fill_subcategory_enabled',
    autoFillSubCategoryId: 'auto_fill_subcategory_id',
  }),
  be_settings: rule(['budgetVersionId', 'deviceKnowledge']),
  be_scheduled_transactions: rule(['budgetVersionId'], {
    accountId: 'entities_account_id',
    payeeId: 'entities_payee_id',
    subCategoryId: 'entities_subcategory_id',
  }),
  be_subcategories: rule(
    ['budgetVersionId', 'deviceKnowledge', 'pinnedGoalIndex', 'pinnedIndex'],
    {
      accountId: 'entities_account_id',
      masterCategoryId: 'entities_master_category_id',
    },
  ),
  be_subtransactions: rule(['budgetVersionId'], {
    transactionId: 'entities_transaction_id',
    payeeId: 'entities_payee_id',
    subCategoryId: 'entities_subcategory_id',
  }),
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
