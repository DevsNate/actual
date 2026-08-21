/**
 * Project-owned projection for the exact checking-account calculation rows
 * proven by the controlled stock captures. This is intentionally separate from
 * monthly category and Ready-to-Assign calculations and rejects unsupported
 * months, balances, and transaction shapes at its caller boundary.
 */

import type { BudgetEntity } from '@actual-app/semantic-core';

import type {
  StockAccountCalculation,
  StockMonthlyAccountCalculation,
} from './stock-calculation-entities';

type CapturedCheckingAccountRows = Readonly<{
  accountCalculations: readonly StockAccountCalculation[];
  monthlyAccountCalculations: readonly StockMonthlyAccountCalculation[];
}>;

export function projectCapturedCheckingAccountRows(
  accounts: readonly BudgetEntity[],
  transactions: readonly BudgetEntity[],
  currentMonth: string,
  nextMonth: string,
): CapturedCheckingAccountRows {
  requireMonthStart(currentMonth);
  requireMonthStart(nextMonth);

  const totals = new Map(
    accounts.map(account => [
      account.entityId,
      capturedAccountTotals(account.entityId, transactions),
    ]),
  );

  return {
    accountCalculations: accounts.map(account => {
      const accountTotals = requireTotals(totals, account.entityId);
      return {
        id: `ac/${account.entityId}`,
        entities_account_id: account.entityId,
        is_tombstone: false,
        cleared_balance: accountTotals.cleared,
        uncleared_balance: accountTotals.uncleared,
        info_count: 0,
        warning_count: accountTotals.warningCount,
        error_count: 0,
        transaction_count: accountTotals.count,
        debt_last_payment_date: null,
        debt_payments: null,
      };
    }),
    monthlyAccountCalculations: accounts.flatMap(account => {
      const accountTotals = requireTotals(totals, account.entityId);
      const rollingBalance = accountTotals.cleared + accountTotals.uncleared;
      if (!Number.isSafeInteger(rollingBalance)) {
        throw new Error('Captured account rolling balance must be safe');
      }
      return [
        monthlyAccountCalculation(
          account.entityId,
          currentMonth,
          accountTotals.cleared,
          accountTotals.uncleared,
          rollingBalance,
          accountTotals.count,
          accountTotals.warningCount,
        ),
        monthlyAccountCalculation(
          account.entityId,
          nextMonth,
          0,
          0,
          rollingBalance,
          0,
          0,
        ),
      ];
    }),
  };
}

type AccountTotals = Readonly<{
  cleared: number;
  uncleared: number;
  count: number;
  warningCount: number;
}>;

function capturedAccountTotals(
  accountId: string,
  transactions: readonly BudgetEntity[],
): AccountTotals {
  const rows = transactions.filter(row => row.payload.accountId === accountId);
  const cleared = rows
    .filter(row => row.payload.cleared === 'Cleared')
    .reduce((sum, row) => sum + Number(row.payload.amount), 0);
  const uncleared = rows
    .filter(row => row.payload.cleared === 'Uncleared')
    .reduce((sum, row) => sum + Number(row.payload.amount), 0);
  if (![cleared, uncleared].every(Number.isSafeInteger)) {
    throw new Error('Captured account balance must be a safe integer');
  }
  return {
    cleared,
    uncleared,
    count: rows.length,
    warningCount: rows.some(
      row =>
        row.payload.subCategoryId === null &&
        row.payload.transferAccountId === null,
    )
      ? 1
      : 0,
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
): StockMonthlyAccountCalculation {
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

function requireTotals(
  totals: ReadonlyMap<string, AccountTotals>,
  accountId: string,
): AccountTotals {
  const value = totals.get(accountId);
  if (!value) {
    throw new Error('Captured account totals are unavailable');
  }
  return value;
}

function requireMonthStart(value: string): void {
  if (!/^\d{4}-\d{2}-01$/u.test(value)) {
    throw new Error('Captured account calculation requires a month start');
  }
}
