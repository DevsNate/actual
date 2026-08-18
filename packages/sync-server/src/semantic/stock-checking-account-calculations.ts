import type { PlanEntity, PlanSnapshot } from '@actual-app/semantic-core';

import type { StockFreshPlanCalculations } from './stock-budget-calculations';
import { projectStockFreshPlanCalculations } from './stock-budget-calculations';

export function projectStockCheckingAccountCalculations(
  snapshot: PlanSnapshot,
): StockFreshPlanCalculations {
  const accounts = snapshot.entities.filter(
    entity => entity.entityKind === 'be_accounts' && !entity.isTombstone,
  );
  if (accounts.length === 0) {
    throw new Error('Checking-account calculations require an account');
  }
  const startingBalancePayee = exactlyOne(
    snapshot.entities.filter(
      entity =>
        entity.entityKind === 'be_payees' &&
        entity.payload.internalName === 'StartingBalancePayee',
    ),
    'be_payees',
  );
  const immediateIncomeCategory = exactlyOne(
    snapshot.entities.filter(
      entity =>
        entity.entityKind === 'be_subcategories' &&
        entity.payload.internalName === 'Category/__ImmediateIncome__',
    ),
    'be_subcategories',
  );
  const groups = accounts.map(account =>
    checkingAccountGroup(
      snapshot.entities,
      account,
      startingBalancePayee,
      immediateIncomeCategory,
    ),
  );
  const accountIds = new Set(accounts.map(account => account.entityId));
  const liveTransactions = snapshot.entities.filter(
    entity => entity.entityKind === 'be_transactions' && !entity.isTombstone,
  );
  if (liveTransactions.length !== groups.length) {
    throw new Error('Expected one Starting Balance per Checking account');
  }
  const base = projectStockFreshPlanCalculations({
    ...snapshot,
    entities: snapshot.entities.filter(
      entity =>
        entity.entityKind !== 'be_accounts' &&
        entity.entityKind !== 'be_transactions' &&
        !(
          entity.entityKind === 'be_payees' &&
          accountIds.has(String(entity.payload.accountId))
        ),
    ),
  });
  const monthlyBudgets = snapshot.entities
    .filter(
      entity =>
        entity.entityKind === 'be_monthly_budgets' &&
        entity.payload.bootstrapRole !== 'opened-budget-prior-month',
    )
    .sort((left, right) =>
      String(left.payload.month).localeCompare(String(right.payload.month)),
    );
  if (monthlyBudgets.length !== 2) {
    throw new Error('Checking-account calculations require two budget months');
  }
  const currentMonth = requireIsoDate(monthlyBudgets[0].payload.month);
  const nextMonth = requireIsoDate(monthlyBudgets[1].payload.month);
  if (
    groups.some(
      group => group.transactionDate.slice(0, 7) !== currentMonth.slice(0, 7),
    )
  ) {
    throw new Error('Starting balance must belong to the current budget month');
  }
  const totalAmount = groups.reduce((sum, group) => sum + group.amount, 0);
  if (!Number.isSafeInteger(totalAmount)) {
    throw new Error('Starting Balance total must be a safe integer');
  }

  return {
    ...base,
    be_monthly_budget_calculations: base.be_monthly_budget_calculations.map(
      row => ({
        ...row,
        immediate_income:
          row.entities_monthly_budget_id === monthlyBudgets[0].entityId
            ? totalAmount
            : 0,
        available_to_budget: totalAmount,
      }),
    ),
    be_account_calculations: groups.map(group => ({
      id: `ac/${group.account.entityId}`,
      entities_account_id: group.account.entityId,
      is_tombstone: false,
      cleared_balance: group.amount,
      uncleared_balance: 0,
      info_count: 0,
      warning_count: 0,
      error_count: 0,
      transaction_count: 1,
      debt_last_payment_date: null,
      debt_payments: null,
    })),
    be_monthly_account_calculations: groups.flatMap(group => [
      monthlyAccountCalculation(
        group.account.entityId,
        currentMonth,
        group.amount,
        group.amount,
        1,
      ),
      monthlyAccountCalculation(
        group.account.entityId,
        nextMonth,
        0,
        group.amount,
        0,
      ),
    ]),
  };
}

function checkingAccountGroup(
  entities: readonly PlanEntity[],
  account: PlanEntity,
  startingBalancePayee: PlanEntity,
  immediateIncomeCategory: PlanEntity,
): {
  account: PlanEntity;
  amount: number;
  transactionDate: string;
} {
  const transaction = exactlyOne(
    entities.filter(
      entity =>
        entity.entityKind === 'be_transactions' &&
        entity.payload.accountId === account.entityId,
    ),
    'be_transactions',
  );
  const transferPayee = exactlyOne(
    entities.filter(
      entity =>
        entity.entityKind === 'be_payees' &&
        entity.payload.accountId === account.entityId,
    ),
    'be_payees',
  );
  const accountName = requireString(account.payload.accountName);
  if (
    account.payload.accountType !== 'Checking' ||
    account.payload.onBudget !== true ||
    account.payload.isClosed !== false ||
    transferPayee.isTombstone ||
    transferPayee.payload.enabled !== true ||
    transferPayee.payload.name !== `Transfer : ${accountName}` ||
    transferPayee.payload.autoFillSubCategoryEnabled !== true ||
    transferPayee.payload.autoFillAmountEnabled !== false ||
    transferPayee.payload.autoFillMemoEnabled !== false ||
    transferPayee.payload.renameOnImportEnabled !== false ||
    transaction.isTombstone ||
    transaction.payload.payeeId !== startingBalancePayee.entityId ||
    transaction.payload.subCategoryId !== immediateIncomeCategory.entityId ||
    transaction.payload.amount !== transaction.payload.cashAmount ||
    transaction.payload.creditAmount !== 0 ||
    transaction.payload.cleared !== 'Cleared' ||
    transaction.payload.accepted !== true ||
    transaction.payload.memo !== null ||
    transaction.payload.transferAccountId !== null ||
    transaction.payload.transferTransactionId !== null ||
    transaction.payload.transferSubtransactionId !== null
  ) {
    throw new Error('Unsupported checking-account calculation state');
  }
  return {
    account,
    amount: requireNonnegativeInteger(transaction.payload.amount),
    transactionDate: requireIsoDate(transaction.payload.date),
  };
}

function monthlyAccountCalculation(
  accountId: string,
  month: string,
  clearedBalance: number,
  rollingBalance: number,
  transactionCount: number,
): Readonly<Record<string, unknown>> {
  return {
    id: `mac/${month.slice(0, 7)}/${accountId}`,
    entities_account_id: accountId,
    is_tombstone: false,
    month,
    cleared_balance: clearedBalance,
    uncleared_balance: 0,
    rolling_balance: rollingBalance,
    info_count: 0,
    warning_count: 0,
    error_count: 0,
    transaction_count: transactionCount,
    debt_interest_due: null,
    debt_interest_paid: null,
    debt_escrow_paid: null,
    debt_last_payment_date: null,
    debt_payments: null,
    debt_estimated_interest_paid: null,
    debt_estimated_escrow_paid: null,
  };
}

function exactlyOne(
  entities: readonly PlanEntity[],
  entityKind: string,
): PlanEntity {
  const matches = entities.filter(
    entity => entity.entityKind === entityKind && !entity.isTombstone,
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${entityKind}`);
  }
  return matches[0];
}

function requireNonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('Starting balance must be a nonnegative integer');
  }
  return Number(value);
}

function requireIsoDate(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  ) {
    throw new Error('Checking-account calculation requires an ISO date');
  }
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new Error('Checking-account calculation requires a string');
  }
  return value;
}
