import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';

import type { StockFreshBudgetCalculations } from './stock-budget-calculations';
import { projectStockFreshBudgetCalculations } from './stock-budget-calculations';

export function projectStockCheckingAccountCalculations(
  snapshot: BudgetSnapshot,
): StockFreshBudgetCalculations {
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
  const balanceAdjustmentPayee = exactlyOne(
    snapshot.entities.filter(
      entity =>
        entity.entityKind === 'be_payees' &&
        entity.payload.internalName === 'BalanceAdjustmentPayee',
    ),
    'be_payees',
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
  const ordinaryTransactions = liveTransactions.filter(
    transaction =>
      !groups.some(
        group => group.startingBalance.entityId === transaction.entityId,
      ) && transaction.payload.payeeId !== balanceAdjustmentPayee.entityId,
  );
  const balanceAdjustments = liveTransactions.filter(
    transaction =>
      transaction.payload.payeeId === balanceAdjustmentPayee.entityId,
  );
  const noneCategory = exactlyOne(
    snapshot.entities.filter(
      entity =>
        entity.entityKind === 'be_subcategories' &&
        entity.payload.internalName === 'Category/__None__',
    ),
    'be_subcategories',
  );
  const base = projectStockFreshBudgetCalculations({
    ...snapshot,
    entities: snapshot.entities.filter(
      entity =>
        !entity.isTombstone &&
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
  const incomeAmount =
    groups.reduce((sum, group) => sum + group.amount, 0) +
    balanceAdjustments.reduce(
      (sum, transaction) =>
        sum +
        manualAdjustmentAmount(
          transaction,
          accounts,
          immediateIncomeCategory,
          currentMonth,
        ),
      0,
    );
  const uncategorizedAmount = ordinaryTransactions.reduce(
    (sum, transaction) =>
      sum + ordinaryTransactionAmount(transaction, accounts, currentMonth),
    0,
  );
  if (
    !Number.isSafeInteger(incomeAmount) ||
    !Number.isSafeInteger(uncategorizedAmount)
  ) {
    throw new Error('Starting Balance total must be a safe integer');
  }

  return {
    ...base,
    be_monthly_budget_calculations: base.be_monthly_budget_calculations.map(
      row => ({
        ...row,
        immediate_income:
          row.entities_monthly_budget_id === monthlyBudgets[0].entityId
            ? incomeAmount
            : 0,
        cash_outflows:
          row.entities_monthly_budget_id === monthlyBudgets[0].entityId
            ? uncategorizedAmount
            : 0,
        balance:
          row.entities_monthly_budget_id === monthlyBudgets[0].entityId
            ? uncategorizedAmount
            : 0,
        over_spent:
          row.entities_monthly_budget_id === monthlyBudgets[0].entityId
            ? Math.min(0, uncategorizedAmount)
            : 0,
        available_to_budget:
          row.entities_monthly_budget_id === monthlyBudgets[0].entityId
            ? incomeAmount
            : incomeAmount + uncategorizedAmount,
        uncategorized_cash_outflows:
          row.entities_monthly_budget_id === monthlyBudgets[0].entityId
            ? uncategorizedAmount
            : 0,
        uncategorized_balance:
          row.entities_monthly_budget_id === monthlyBudgets[0].entityId
            ? uncategorizedAmount
            : 0,
      }),
    ),
    be_monthly_subcategory_budget_calculations:
      base.be_monthly_subcategory_budget_calculations.map(row => {
        const sourceId = String(row.entities_monthly_subcategory_budget_id);
        const source = exactlyOne(
          snapshot.entities.filter(
            entity =>
              entity.entityKind === 'be_monthly_subcategory_budgets' &&
              entity.entityId === sourceId,
          ),
          'be_monthly_subcategory_budgets',
        );
        if (source.payload.subCategoryId === noneCategory.entityId) {
          if (source.payload.monthlyBudgetId === monthlyBudgets[0].entityId) {
            return {
              ...row,
              cash_outflows: uncategorizedAmount,
              balance: uncategorizedAmount,
              unbudgeted_cash_outflows: uncategorizedAmount,
              goal_overall_outflows: uncategorizedAmount,
            };
          }
          if (source.payload.monthlyBudgetId === monthlyBudgets[1].entityId) {
            return {
              ...row,
              spent_previous_month: uncategorizedAmount,
              balance_previous_month: uncategorizedAmount,
              budgeted_average: 0,
              spent_average: uncategorizedAmount,
              payment_average: 0,
            };
          }
        }
        if (source.payload.subCategoryId !== immediateIncomeCategory.entityId) {
          return row;
        }
        if (source.payload.monthlyBudgetId === monthlyBudgets[0].entityId) {
          return {
            ...row,
            cash_outflows: incomeAmount,
            positive_cash_outflows: incomeAmount,
            balance: incomeAmount,
            budgeted_cash_outflows: incomeAmount,
            goal_overall_outflows: incomeAmount,
          };
        }
        if (source.payload.monthlyBudgetId === monthlyBudgets[1].entityId) {
          return {
            ...row,
            balance: incomeAmount,
            spent_previous_month: incomeAmount,
            balance_previous_month: incomeAmount,
            budgeted_average: 0,
            spent_average: incomeAmount,
            payment_average: 0,
          };
        }
        throw new Error(
          'Immediate Income calculation references another month',
        );
      }),
    be_account_calculations: groups.map(group => {
      const totals = accountTotals(group.account.entityId, liveTransactions);
      return {
        id: `ac/${group.account.entityId}`,
        entities_account_id: group.account.entityId,
        is_tombstone: false,
        cleared_balance: totals.cleared,
        uncleared_balance: totals.uncleared,
        info_count: 0,
        warning_count: totals.warningCount,
        error_count: 0,
        transaction_count: totals.count,
        debt_last_payment_date: null,
        debt_payments: null,
      };
    }),
    be_monthly_account_calculations: groups.flatMap(group => {
      const totals = accountTotals(group.account.entityId, liveTransactions);
      return [
        monthlyAccountCalculation(
          group.account.entityId,
          currentMonth,
          totals.cleared,
          totals.uncleared,
          totals.cleared + totals.uncleared,
          totals.count,
          totals.warningCount,
        ),
        monthlyAccountCalculation(
          group.account.entityId,
          nextMonth,
          0,
          0,
          totals.cleared + totals.uncleared,
          0,
          0,
        ),
      ];
    }),
  };
}

function checkingAccountGroup(
  entities: readonly BudgetEntity[],
  account: BudgetEntity,
  startingBalancePayee: BudgetEntity,
  immediateIncomeCategory: BudgetEntity,
): {
  account: BudgetEntity;
  amount: number;
  transactionDate: string;
  startingBalance: BudgetEntity;
} {
  const transaction = exactlyOne(
    entities.filter(
      entity =>
        entity.entityKind === 'be_transactions' &&
        entity.payload.accountId === account.entityId &&
        entity.payload.payeeId === startingBalancePayee.entityId &&
        entity.payload.subCategoryId === immediateIncomeCategory.entityId,
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
    typeof account.payload.isClosed !== 'boolean' ||
    transferPayee.isTombstone ||
    transferPayee.payload.enabled !== true ||
    transferPayee.payload.name !== `Transfer : ${accountName}` ||
    transferPayee.payload.autoFillSubCategoryEnabled !== true ||
    transferPayee.payload.autoFillAmount !== 0 ||
    transferPayee.payload.autoFillAmountEnabled !== false ||
    transferPayee.payload.autoFillMemoEnabled !== false ||
    transferPayee.payload.renameOnImportEnabled !== true ||
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
    startingBalance: transaction,
  };
}

function manualAdjustmentAmount(
  transaction: BudgetEntity,
  accounts: readonly BudgetEntity[],
  immediateIncomeCategory: BudgetEntity,
  currentMonth: string,
): number {
  if (
    !accounts.some(
      account => account.entityId === transaction.payload.accountId,
    ) ||
    transaction.payload.subCategoryId !== immediateIncomeCategory.entityId ||
    transaction.payload.scheduledTransactionId !== null ||
    transaction.payload.amount !== transaction.payload.cashAmount ||
    transaction.payload.creditAmount !== 0 ||
    transaction.payload.creditAmountAdjusted !== 0 ||
    transaction.payload.subcategoryCreditAmountPreceding !== 0 ||
    transaction.payload.memo !== 'Closed Account' ||
    transaction.payload.cleared !== 'Cleared' ||
    transaction.payload.accepted !== true ||
    transaction.payload.transferAccountId !== null ||
    transaction.payload.transferTransactionId !== null ||
    transaction.payload.transferSubtransactionId !== null ||
    requireIsoDate(transaction.payload.date).slice(0, 7) !==
      currentMonth.slice(0, 7) ||
    !Number.isSafeInteger(transaction.payload.amount)
  ) {
    throw new Error('Unsupported Manual Balance Adjustment state');
  }
  return Number(transaction.payload.amount);
}

function ordinaryTransactionAmount(
  transaction: BudgetEntity,
  accounts: readonly BudgetEntity[],
  currentMonth: string,
): number {
  if (
    !accounts.some(
      account => account.entityId === transaction.payload.accountId,
    ) ||
    transaction.payload.subCategoryId !== null ||
    transaction.payload.scheduledTransactionId !== null ||
    transaction.payload.amount !== transaction.payload.cashAmount ||
    transaction.payload.creditAmount !== 0 ||
    transaction.payload.creditAmountAdjusted !== 0 ||
    transaction.payload.subcategoryCreditAmountPreceding !== 0 ||
    transaction.payload.cleared !== 'Uncleared' ||
    transaction.payload.accepted !== true ||
    transaction.payload.transferAccountId !== null ||
    transaction.payload.transferTransactionId !== null ||
    transaction.payload.transferSubtransactionId !== null ||
    requireIsoDate(transaction.payload.date).slice(0, 7) !==
      currentMonth.slice(0, 7) ||
    !Number.isSafeInteger(transaction.payload.amount)
  ) {
    throw new Error('Unsupported ordinary transaction calculation state');
  }
  return Number(transaction.payload.amount);
}

function accountTotals(
  accountId: string,
  transactions: readonly BudgetEntity[],
): { cleared: number; uncleared: number; count: number; warningCount: number } {
  const rows = transactions.filter(row => row.payload.accountId === accountId);
  const cleared = rows
    .filter(row => row.payload.cleared === 'Cleared')
    .reduce((sum, row) => sum + Number(row.payload.amount), 0);
  const uncleared = rows
    .filter(row => row.payload.cleared === 'Uncleared')
    .reduce((sum, row) => sum + Number(row.payload.amount), 0);
  if (![cleared, uncleared].every(Number.isSafeInteger)) {
    throw new Error('Account balance must be a safe integer');
  }
  return {
    cleared,
    uncleared,
    count: rows.length,
    warningCount: rows.some(row => row.payload.subCategoryId === null) ? 1 : 0,
  };
}

function monthlyAccountCalculation(
  accountId: string,
  month: string,
  clearedBalance: number,
  unclearedBalance: number,
  rollingBalance: number,
  transactionCount: number,
  warningCount: number,
): Readonly<Record<string, unknown>> {
  return {
    id: `mac/${month.slice(0, 7)}/${accountId}`,
    entities_account_id: accountId,
    is_tombstone: false,
    month,
    cleared_balance: clearedBalance,
    uncleared_balance: unclearedBalance,
    rolling_balance: rollingBalance,
    info_count: 0,
    warning_count: warningCount,
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
  entities: readonly BudgetEntity[],
  entityKind: string,
): BudgetEntity {
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
