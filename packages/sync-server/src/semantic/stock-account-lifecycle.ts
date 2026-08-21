import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalManualBalanceAdjustment,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';
import { projectStockRequestEntity } from './stock-budget-projection';
import { isRecord } from './stock-operation';

const MANUAL_ADJUSTMENT_KEYS = [
  'accepted',
  'amount',
  'cash_amount',
  'check_number',
  'cleared',
  'credit_amount',
  'credit_amount_adjusted',
  'date',
  'date_entered_from_schedule',
  'debt_transaction_type',
  'entities_account_id',
  'entities_payee_id',
  'entities_scheduled_transaction_id',
  'entities_subcategory_id',
  'flag',
  'id',
  'imported_date',
  'imported_payee',
  'is_tombstone',
  'matched_transaction_id',
  'memo',
  'original_imported_payee',
  'provider_cleansed_payee',
  'source',
  'subcategory_credit_amount_preceding',
  'transfer_account_id',
  'transfer_subtransaction_id',
  'transfer_transaction_id',
  'ynab_id',
] as const;

export type StockAccountLifecycle =
  | {
      kind: 'close';
      accountId: string;
      adjustment: CanonicalManualBalanceAdjustment;
      changes: BudgetChangeSetCommand['changes'];
      changedEntities: Readonly<Record<string, unknown>>;
    }
  | {
      kind: 'reopen';
      accountId: string;
      changes: BudgetChangeSetCommand['changes'];
      changedEntities: Readonly<Record<string, unknown>>;
    };

export function parseStockAccountLifecycleDelta(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockAccountLifecycle | null {
  const keys = Object.keys(changedEntities).sort();
  if (keys.length === 1 && keys[0] === 'be_accounts') {
    return parseReopen(changedEntities.be_accounts, snapshot);
  }
  if (
    keys.length === 2 &&
    keys[0] === 'be_accounts' &&
    keys[1] === 'be_transaction_groups'
  ) {
    return parseClose(
      changedEntities.be_accounts,
      changedEntities.be_transaction_groups,
      snapshot,
    );
  }
  return null;
}

function parseReopen(
  accountRows: unknown,
  snapshot: BudgetSnapshot,
): StockAccountLifecycle | null {
  const row = exactlyOneRecord(accountRows);
  if (!row || typeof row.id !== 'string') return null;
  const account = entity(snapshot, 'be_accounts', row.id);
  if (
    !account ||
    account.isTombstone ||
    account.payload.accountType !== 'Checking' ||
    account.payload.isClosed !== true ||
    !sameRecord(row, { ...projectStockRequestEntity(account), is_closed: false })
  ) {
    return null;
  }
  return {
    kind: 'reopen',
    accountId: account.entityId,
    changes: [{ ...account, payload: { ...account.payload, isClosed: false } }],
    changedEntities: buildStockBudgetEmptyDelta(snapshot),
  };
}

function parseClose(
  accountRows: unknown,
  groupRows: unknown,
  snapshot: BudgetSnapshot,
): StockAccountLifecycle | null {
  const accountRow = exactlyOneRecord(accountRows);
  const group = exactlyOneRecord(groupRows);
  if (
    !accountRow ||
    !group ||
    typeof accountRow.id !== 'string' ||
    typeof group.id !== 'string' ||
    group.id !== (isRecord(group.be_transaction) && group.be_transaction.id) ||
    group.be_subtransactions !== null ||
    !isRecord(group.be_transaction)
  ) {
    return null;
  }
  const account = entity(snapshot, 'be_accounts', accountRow.id);
  const row = group.be_transaction;
  const payee = systemEntity(snapshot, 'be_payees', 'BalanceAdjustmentPayee');
  const category = systemEntity(
    snapshot,
    'be_subcategories',
    'Category/__ImmediateIncome__',
  );
  const balance = snapshot.entities
    .filter(
      item =>
        item.entityKind === 'be_transactions' &&
        !item.isTombstone &&
        item.payload.accountId === accountRow.id,
    )
    .reduce((sum, item) => sum + Number(item.payload.amount), 0);
  if (
    !account ||
    !payee ||
    !category ||
    account.isTombstone ||
    account.payload.accountType !== 'Checking' ||
    account.payload.isClosed !== false ||
    !Number.isSafeInteger(balance) ||
    balance === 0 ||
    snapshot.entities.some(
      item =>
        item.entityKind === 'be_transactions' && item.entityId === group.id,
    ) ||
    !sameRecord(accountRow, {
      ...projectStockRequestEntity(account),
      is_closed: true,
    }) ||
    !hasExactKeys(row, MANUAL_ADJUSTMENT_KEYS) ||
    row.is_tombstone !== false ||
    row.entities_account_id !== account.entityId ||
    row.entities_payee_id !== payee.entityId ||
    row.entities_subcategory_id !== category.entityId ||
    row.amount !== -balance ||
    row.cash_amount !== 0 ||
    row.credit_amount !== 0 ||
    row.credit_amount_adjusted !== 0 ||
    row.subcategory_credit_amount_preceding !== 0 ||
    row.memo !== 'Closed Account' ||
    row.cleared !== 'Cleared' ||
    row.accepted !== true ||
    row.transfer_account_id !== null ||
    row.transfer_transaction_id !== null ||
    row.transfer_subtransaction_id !== null ||
    row.entities_scheduled_transaction_id !== null ||
    row.date_entered_from_schedule !== null ||
    row.check_number !== null ||
    row.flag !== null ||
    row.matched_transaction_id !== null ||
    row.ynab_id !== null ||
    row.imported_payee !== null ||
    row.imported_date !== null ||
    row.original_imported_payee !== null ||
    row.provider_cleansed_payee !== null ||
    row.source !== null ||
    row.debt_transaction_type !== null ||
    typeof row.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(row.date)
  ) {
    return null;
  }
  const adjustment: CanonicalManualBalanceAdjustment = {
    id: group.id,
    budgetId: snapshot.budgetId,
    accountId: account.entityId,
    payeeId: payee.entityId,
    categoryId: category.entityId,
    date: row.date,
    amount: -balance,
    memo: 'Closed Account',
  };
  const changes: BudgetChangeSetCommand['changes'] = [
    { ...account, payload: { ...account.payload, isClosed: true } },
    {
      entityKind: 'be_transactions',
      entityId: adjustment.id,
      isTombstone: false,
      payload: normalizedAdjustmentPayload(snapshot, row, adjustment),
    },
  ];
  return {
    kind: 'close',
    accountId: account.entityId,
    adjustment,
    changes,
    changedEntities: calculationDelta(snapshot, changes),
  };
}

function normalizedAdjustmentPayload(
  snapshot: BudgetSnapshot,
  row: Readonly<Record<string, unknown>>,
  adjustment: CanonicalManualBalanceAdjustment,
): Readonly<Record<string, unknown>> {
  return {
    budgetVersionId: snapshot.budgetVersionId,
    accountId: adjustment.accountId,
    payeeId: adjustment.payeeId,
    subCategoryId: adjustment.categoryId,
    scheduledTransactionId: null,
    date: adjustment.date,
    dateEnteredFromSchedule: null,
    amount: adjustment.amount,
    cashAmount: adjustment.amount,
    creditAmount: 0,
    creditAmountAdjusted: row.credit_amount_adjusted ?? 0,
    subcategoryCreditAmountPreceding:
      row.subcategory_credit_amount_preceding ?? 0,
    memo: 'Closed Account',
    cleared: 'Cleared',
    accepted: true,
    checkNumber: row.check_number ?? null,
    flag: row.flag ?? null,
    transferAccountId: null,
    transferTransactionId: null,
    transferSubtransactionId: null,
    matchedTransactionId: row.matched_transaction_id ?? null,
    ynabId: row.ynab_id ?? null,
    importedPayee: row.imported_payee ?? null,
    importedDate: row.imported_date ?? null,
    originalImportedPayee: row.original_imported_payee ?? null,
    providerCleansedPayee: row.provider_cleansed_payee ?? null,
    source: row.source ?? null,
    debtTransactionType: row.debt_transaction_type ?? null,
  };
}

function calculationDelta(
  snapshot: BudgetSnapshot,
  changes: BudgetChangeSetCommand['changes'],
): Readonly<Record<string, unknown>> {
  const before = projectStockBudgetCalculations(snapshot);
  const changed = new Map(
    changes.map(item => [`${item.entityKind}\u0000${item.entityId}`, item]),
  );
  const retainedKeys = new Set(
    snapshot.entities.map(item => `${item.entityKind}\u0000${item.entityId}`),
  );
  const afterSnapshot = {
    ...snapshot,
    entities: [
      ...snapshot.entities.map(
        item => changed.get(`${item.entityKind}\u0000${item.entityId}`) ?? item,
      ),
      ...changes.filter(
        item => !retainedKeys.has(`${item.entityKind}\u0000${item.entityId}`),
      ),
    ],
  };
  const after = projectStockBudgetCalculations(afterSnapshot);
  const result: Record<string, unknown> = buildStockBudgetEmptyDelta(snapshot);
  for (const key of Object.keys(after) as Array<keyof typeof after>) {
    const prior = new Map(
      before[key].map(row => [String(row.id), row] as const),
    );
    result[key] = after[key].filter(
      row => !sameRecord(row, prior.get(String(row.id)) ?? {}),
    );
  }
  return result;
}

function systemEntity(
  snapshot: BudgetSnapshot,
  kind: string,
  internalName: string,
): BudgetEntity | null {
  const rows = snapshot.entities.filter(
    item =>
      item.entityKind === kind &&
      !item.isTombstone &&
      item.payload.internalName === internalName,
  );
  return rows.length === 1 ? rows[0] : null;
}

function entity(
  snapshot: BudgetSnapshot,
  kind: string,
  id: string,
): BudgetEntity | undefined {
  return snapshot.entities.find(
    item => item.entityKind === kind && item.entityId === id,
  );
}

function exactlyOneRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value.length === 1 && isRecord(value[0])
    ? value[0]
    : null;
}

function sameRecord(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  return JSON.stringify(sortRecord(left)) === JSON.stringify(sortRecord(right));
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    actual.length === expectedKeys.length &&
    actual.every((key, index) => key === expectedKeys[index])
  );
}

function sortRecord(value: Readonly<Record<string, unknown>>): unknown {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, isRecord(item) ? sortRecord(item) : item]),
  );
}
