import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';
import { projectStockRequestEntity } from './stock-budget-projection';
import { isRecord } from './stock-operation';

export type StockPristineAccountDelete = {
  deletion: {
    budgetId: string;
    accountId: string;
    transferPayeeId: string;
    startingBalanceTransactionId: string;
  };
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
};

export function parseStockPristineAccountDelete(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockPristineAccountDelete | null {
  if (
    !hasExactKeys(changedEntities, [
      'be_accounts',
      'be_payees',
      'be_transaction_groups',
    ])
  ) {
    return null;
  }
  const accountRow = exactlyOneRecord(changedEntities.be_accounts);
  const payeeRow = exactlyOneRecord(changedEntities.be_payees);
  const groupRow = exactlyOneRecord(changedEntities.be_transaction_groups);
  if (
    !accountRow ||
    !payeeRow ||
    !groupRow ||
    !isRecord(groupRow.be_transaction) ||
    groupRow.be_subtransactions !== null ||
    groupRow.id !== groupRow.be_transaction.id ||
    typeof accountRow.id !== 'string' ||
    typeof payeeRow.id !== 'string' ||
    typeof groupRow.id !== 'string'
  ) {
    return null;
  }
  const transactionRow = groupRow.be_transaction;
  const account = entity(snapshot, 'be_accounts', accountRow.id);
  const payee = entity(snapshot, 'be_payees', payeeRow.id);
  const transaction = entity(snapshot, 'be_transactions', groupRow.id);
  if (
    !account ||
    !payee ||
    !transaction ||
    account.isTombstone ||
    payee.isTombstone ||
    transaction.isTombstone ||
    account.payload.accountType !== 'Checking' ||
    account.payload.isClosed !== false ||
    payee.payload.accountId !== account.entityId ||
    transaction.payload.accountId !== account.entityId ||
    transaction.payload.amount !== transaction.payload.cashAmount ||
    transaction.payload.creditAmount !== 0 ||
    transaction.payload.transferAccountId !== null ||
    transaction.payload.transferTransactionId !== null ||
    transaction.payload.transferSubtransactionId !== null ||
    snapshot.entities.filter(
      item =>
        item.entityKind === 'be_transactions' &&
        item.payload.accountId === account.entityId,
    ).length !== 1
  ) {
    return null;
  }
  const startingBalancePayee = entity(
    snapshot,
    'be_payees',
    String(transaction.payload.payeeId),
  );
  const immediateIncome = entity(
    snapshot,
    'be_subcategories',
    String(transaction.payload.subCategoryId),
  );
  if (
    startingBalancePayee?.payload.internalName !== 'StartingBalancePayee' ||
    immediateIncome?.payload.internalName !== 'Category/__ImmediateIncome__'
  ) {
    return null;
  }
  if (
    !sameRecord(accountRow, {
      ...projectStockRequestEntity(account),
      is_tombstone: true,
    }) ||
    !sameRecord(payeeRow, {
      ...projectStockRequestEntity(payee),
      is_tombstone: true,
    }) ||
    !sameRecord(transactionRow, {
      ...projectStockRequestEntity(transaction),
      is_tombstone: true,
    })
  ) {
    return null;
  }

  const changes = [account, payee, transaction].map(item => ({
    ...item,
    isTombstone: true,
  }));
  return {
    deletion: {
      budgetId: snapshot.budgetId,
      accountId: account.entityId,
      transferPayeeId: payee.entityId,
      startingBalanceTransactionId: transaction.entityId,
    },
    changes,
    changedEntities: calculationDeleteDelta(snapshot, changes),
  };
}

function calculationDeleteDelta(
  snapshot: BudgetSnapshot,
  changes: readonly BudgetEntity[],
): Readonly<Record<string, unknown>> {
  const before = projectStockBudgetCalculations(snapshot);
  const changedKeys = new Set(
    changes.map(change => `${change.entityKind}\u0000${change.entityId}`),
  );
  const afterSnapshot = {
    ...snapshot,
    entities: snapshot.entities.map(entity =>
      changedKeys.has(`${entity.entityKind}\u0000${entity.entityId}`)
        ? { ...entity, isTombstone: true }
        : entity,
    ),
  };
  const after = projectStockBudgetCalculations(afterSnapshot);
  return {
    ...buildStockBudgetEmptyDelta(snapshot),
    be_account_calculations: removedRows(
      before.be_account_calculations,
      after.be_account_calculations,
      terminalAccountCalculation,
    ),
    be_monthly_account_calculations: removedRows(
      before.be_monthly_account_calculations,
      after.be_monthly_account_calculations,
      terminalMonthlyAccountCalculation,
    ),
    be_monthly_budget_calculations: changedRows(
      before.be_monthly_budget_calculations,
      after.be_monthly_budget_calculations,
    ),
    be_monthly_subcategory_budget_calculations: changedRows(
      before.be_monthly_subcategory_budget_calculations,
      after.be_monthly_subcategory_budget_calculations,
    ),
  };
}

function changedRows(
  before: readonly Readonly<Record<string, unknown>>[],
  after: readonly Readonly<Record<string, unknown>>[],
): readonly Readonly<Record<string, unknown>>[] {
  const prior = new Map(before.map(row => [String(row.id), row]));
  return after.filter(row => !sameRecord(row, prior.get(String(row.id)) ?? {}));
}

function removedRows(
  before: readonly Readonly<Record<string, unknown>>[],
  after: readonly Readonly<Record<string, unknown>>[],
  terminal: (
    row: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] {
  const retained = new Set(after.map(row => String(row.id)));
  return before.filter(row => !retained.has(String(row.id))).map(terminal);
}

function terminalAccountCalculation(
  row: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    ...row,
    is_tombstone: true,
    cleared_balance: 0,
    uncleared_balance: 0,
    info_count: 0,
    warning_count: 0,
    error_count: 0,
    transaction_count: 0,
  };
}

function terminalMonthlyAccountCalculation(
  row: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    ...row,
    is_tombstone: true,
    cleared_balance: 0,
    uncleared_balance: 0,
    rolling_balance: 0,
    info_count: 0,
    warning_count: 0,
    error_count: 0,
    transaction_count: 0,
  };
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

function sortRecord(value: Readonly<Record<string, unknown>>): unknown {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, isRecord(item) ? sortRecord(item) : item]),
  );
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
