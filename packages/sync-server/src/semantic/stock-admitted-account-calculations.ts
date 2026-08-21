import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';

import { projectCapturedAccountRows } from './stock-account-calculation-projection';
import { projectStockFreshBudgetCalculations } from './stock-budget-calculations';
import type { StockBudgetCalculationEntities } from './stock-calculation-entities';
import { projectCapturedMonthlyBudgetRows } from './stock-monthly-budget-calculation-projection';
import { projectCapturedMonthlyCategoryRows } from './stock-monthly-category-calculation-projection';

export function projectStockAdmittedAccountCalculations(
  snapshot: BudgetSnapshot,
): StockBudgetCalculationEntities {
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
    admittedAccountOpeningGroup(
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
  const liveSplitLines = snapshot.entities.filter(
    entity => entity.entityKind === 'be_subtransactions' && !entity.isTombstone,
  );
  const splitCategory = exactlyOne(
    snapshot.entities.filter(
      entity =>
        entity.entityKind === 'be_subcategories' &&
        entity.payload.internalName === 'Category/__Split__',
    ),
    'be_subcategories',
  );
  const splitParents = liveTransactions.filter(
    transaction => transaction.payload.subCategoryId === splitCategory.entityId,
  );
  validateSplitCalculationState(splitParents, liveSplitLines, accounts);
  const ordinaryTransactions = liveTransactions.filter(
    transaction =>
      !groups.some(
        group => group.startingBalance.entityId === transaction.entityId,
      ) &&
      transaction.payload.payeeId !== balanceAdjustmentPayee.entityId &&
      transaction.payload.subCategoryId !== splitCategory.entityId &&
      transaction.payload.transferAccountId === null &&
      transaction.payload.transferTransactionId === null &&
      transaction.payload.scheduledTransactionId === null,
  );
  const scheduledOccurrences = liveTransactions.filter(
    transaction =>
      typeof transaction.payload.scheduledTransactionId === 'string',
  );
  const transferTransactions = liveTransactions.filter(
    transaction =>
      typeof transaction.payload.transferAccountId === 'string' ||
      typeof transaction.payload.transferTransactionId === 'string',
  );
  validateTransferCalculationState(transferTransactions, accounts);
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
    entities: snapshot.entities
      .filter(
        entity =>
          !entity.isTombstone &&
          entity.entityKind !== 'be_accounts' &&
          entity.entityKind !== 'be_transactions' &&
          entity.entityKind !== 'be_subtransactions' &&
          entity.entityKind !== 'be_scheduled_transactions' &&
          entity.entityKind !== 'be_scheduled_subtransactions' &&
          entity.entityKind !== 'be_money_movements' &&
          !(
            entity.entityKind === 'be_payees' &&
            typeof entity.payload.accountId === 'string' &&
            accountIds.has(entity.payload.accountId)
          ),
      )
      .map(entity =>
        entity.entityKind === 'be_monthly_subcategory_budgets'
          ? { ...entity, payload: { ...entity.payload, budgeted: 0 } }
          : entity,
      ),
  });
  const monthlyBudgets = snapshot.entities
    .filter(
      entity =>
        entity.entityKind === 'be_monthly_budgets' &&
        entity.payload.bootstrapRole !== 'opened-budget-prior-month',
    )
    .sort((left, right) =>
      requireIsoDate(left.payload.month).localeCompare(
        requireIsoDate(right.payload.month),
      ),
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
    groups.reduce(
      (sum, group) => sum + (group.isCreditAccount ? 0 : group.amount),
      0,
    ) +
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
  const categorizedCashOutflows = new Map<string, number>();
  let uncategorizedAmount = 0;
  for (const transaction of ordinaryTransactions) {
    const amount = ordinaryTransactionAmount(
      transaction,
      accounts,
      currentMonth,
    );
    const categoryId = transaction.payload.subCategoryId;
    if (categoryId === null) {
      uncategorizedAmount += amount;
    } else {
      const id = requireString(categoryId);
      categorizedCashOutflows.set(
        id,
        (categorizedCashOutflows.get(id) ?? 0) + amount,
      );
    }
  }
  for (const line of liveSplitLines) {
    const categoryId = requireString(line.payload.subCategoryId);
    categorizedCashOutflows.set(
      categoryId,
      (categorizedCashOutflows.get(categoryId) ?? 0) +
        requireInteger(line.payload.amount),
    );
  }
  for (const transaction of scheduledOccurrences) {
    const amount = scheduledOccurrenceAmount(
      transaction,
      snapshot.entities,
      accounts,
      currentMonth,
    );
    const categoryId = requireString(transaction.payload.subCategoryId);
    categorizedCashOutflows.set(
      categoryId,
      (categorizedCashOutflows.get(categoryId) ?? 0) + amount,
    );
  }
  const categorizedAmount = [...categorizedCashOutflows.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const paymentCashOutflows = capturedPaymentCashOutflows(
    transferTransactions,
    accounts,
    snapshot.entities,
  );
  const totalCashOutflows =
    uncategorizedAmount +
    categorizedAmount +
    [...paymentCashOutflows.values()].reduce((sum, amount) => sum + amount, 0);
  if (
    !Number.isSafeInteger(incomeAmount) ||
    !Number.isSafeInteger(uncategorizedAmount)
  ) {
    throw new Error('Starting Balance total must be a safe integer');
  }
  const accountRows = projectCapturedAccountRows(
    accounts,
    liveTransactions,
    currentMonth,
    nextMonth,
  );
  const monthlyCategoryRows = projectCapturedMonthlyCategoryRows({
    baseRows: base.be_monthly_subcategory_budget_calculations,
    sourceRows: snapshot.entities.filter(
      entity => entity.entityKind === 'be_monthly_subcategory_budgets',
    ),
    currentMonthlyBudgetId: monthlyBudgets[0].entityId,
    nextMonthlyBudgetId: monthlyBudgets[1].entityId,
    currentMonth,
    nextMonth,
    noneCategoryId: noneCategory.entityId,
    immediateIncomeCategoryId: immediateIncomeCategory.entityId,
    uncategorizedCashOutflows: uncategorizedAmount,
    categorizedCashOutflows,
    paymentCashOutflows,
    immediateIncome: incomeAmount,
    scheduledTransactions: capturedScheduledTransactions(snapshot.entities),
  });
  const sourceByCalculationId = new Map(
    snapshot.entities
      .filter(entity => entity.entityKind === 'be_monthly_subcategory_budgets')
      .map(entity => [`mcbc/${entity.entityId.slice('mcb/'.length)}`, entity]),
  );
  const currentCategoryRows = monthlyCategoryRows.filter(row => {
    const source = sourceByCalculationId.get(String(row.id));
    return (
      source?.payload.monthlyBudgetId === monthlyBudgets[0].entityId &&
      source.payload.subCategoryId !== immediateIncomeCategory.entityId
    );
  });
  if (currentCategoryRows.length === 0) {
    throw new Error('Current category calculation rows are unavailable');
  }
  const currentBudgeted = snapshot.entities
    .filter(
      entity =>
        entity.entityKind === 'be_monthly_subcategory_budgets' &&
        entity.payload.monthlyBudgetId === monthlyBudgets[0].entityId,
    )
    .reduce(
      (sum, entity) => sum + requireMonthlyBudgeted(entity.payload.budgeted),
      0,
    );
  const currentCategoryBalance = currentCategoryRows.reduce(
    (sum, row) => sum + row.balance,
    0,
  );
  const currentOverspent = currentCategoryRows.reduce(
    (sum, row) => sum + Math.min(0, row.balance),
    0,
  );
  const positiveCategoryCarry = currentCategoryRows.reduce(
    (sum, row) => sum + Math.max(0, row.balance),
    0,
  );

  return {
    ...base,
    be_monthly_budget_calculations: projectCapturedMonthlyBudgetRows({
      baseRows: base.be_monthly_budget_calculations,
      currentMonthlyBudgetId: monthlyBudgets[0].entityId,
      nextMonthlyBudgetId: monthlyBudgets[1].entityId,
      immediateIncome: incomeAmount,
      cashOutflows: totalCashOutflows,
      uncategorizedCashOutflows: uncategorizedAmount,
      currentBudgeted,
      currentCategoryBalance,
      currentOverspent,
      positiveCategoryCarry,
    }),
    be_monthly_subcategory_budget_calculations: monthlyCategoryRows,
    be_account_calculations: accountRows.accountCalculations,
    be_monthly_account_calculations: accountRows.monthlyAccountCalculations,
  };
}

function requireMonthlyBudgeted(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('Monthly category budget must be nonnegative');
  }
  return Number(value);
}

function validateSplitCalculationState(
  parents: readonly BudgetEntity[],
  lines: readonly BudgetEntity[],
  accounts: readonly BudgetEntity[],
): void {
  const linesByParent = new Map<string, BudgetEntity[]>();
  for (const line of lines) {
    const parentId = requireString(line.payload.transactionId);
    const current = linesByParent.get(parentId) ?? [];
    current.push(line);
    linesByParent.set(parentId, current);
  }
  for (const parent of parents) {
    const children = (linesByParent.get(parent.entityId) ?? []).sort(
      (left, right) =>
        requireInteger(left.payload.sortableIndex) -
        requireInteger(right.payload.sortableIndex),
    );
    if (
      children.length !== 2 ||
      children.some(
        (line, index) =>
          requireInteger(line.payload.sortableIndex) !== index ||
          line.payload.cashAmount !== line.payload.amount ||
          line.payload.creditAmount !== 0 ||
          line.payload.transferAccountId !== null ||
          line.payload.transferTransactionId !== null,
      ) ||
      children.reduce(
        (sum, line) => sum + requireInteger(line.payload.amount),
        0,
      ) !== parent.payload.amount ||
      !accounts.some(account => account.entityId === parent.payload.accountId)
    ) {
      throw new Error('Unsupported split transaction calculation state');
    }
    linesByParent.delete(parent.entityId);
  }
  if (linesByParent.size !== 0) {
    throw new Error('Split lines require one live split parent');
  }
}

function admittedAccountOpeningGroup(
  entities: readonly BudgetEntity[],
  account: BudgetEntity,
  startingBalancePayee: BudgetEntity,
  immediateIncomeCategory: BudgetEntity,
): {
  account: BudgetEntity;
  amount: number;
  transactionDate: string;
  startingBalance: BudgetEntity;
  isCreditAccount: boolean;
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
  const accountType = account.payload.accountType;
  const isCreditAccount = accountType === 'CreditCard';
  const isCashAccount = accountType === 'Checking' || accountType === 'Cash';
  if (
    (!isCashAccount && !isCreditAccount) ||
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
    (isCashAccount &&
      (transaction.payload.amount !== transaction.payload.cashAmount ||
        transaction.payload.creditAmount !== 0)) ||
    (isCreditAccount &&
      (transaction.payload.amount !== transaction.payload.creditAmount ||
        transaction.payload.cashAmount !== 0)) ||
    transaction.payload.cleared !== 'Cleared' ||
    transaction.payload.accepted !== true ||
    transaction.payload.memo !== null ||
    transaction.payload.transferAccountId !== null ||
    transaction.payload.transferTransactionId !== null ||
    transaction.payload.transferSubtransactionId !== null
  ) {
    throw new Error('Unsupported admitted account calculation state');
  }
  return {
    account,
    amount: isCreditAccount
      ? requireInteger(transaction.payload.amount)
      : requireNonnegativeInteger(transaction.payload.amount),
    transactionDate: requireIsoDate(transaction.payload.date),
    startingBalance: transaction,
    isCreditAccount,
  };
}

function capturedPaymentCashOutflows(
  transfers: readonly BudgetEntity[],
  accounts: readonly BudgetEntity[],
  entities: readonly BudgetEntity[],
): ReadonlyMap<string, number> {
  const creditAccountIds = new Set(
    accounts
      .filter(account => account.payload.accountType === 'CreditCard')
      .map(account => account.entityId),
  );
  if (creditAccountIds.size === 0) return new Map();

  const paymentCategoryByAccount = new Map<string, string>();
  for (const accountId of creditAccountIds) {
    const categories = entities.filter(
      entity =>
        entity.entityKind === 'be_subcategories' &&
        !entity.isTombstone &&
        entity.payload.type === 'DBT' &&
        entity.payload.accountId === accountId,
    );
    if (categories.length !== 1) {
      throw new Error('Expected exactly one credit-card payment category');
    }
    paymentCategoryByAccount.set(accountId, categories[0].entityId);
  }

  const result = new Map<string, number>();
  for (const leg of transfers) {
    const accountId = requireString(leg.payload.accountId);
    if (!creditAccountIds.has(accountId)) continue;
    const amount = requireInteger(leg.payload.amount);
    if (amount <= 0) {
      throw new Error('Captured credit-card payment leg must be positive');
    }
    const categoryId = paymentCategoryByAccount.get(accountId)!;
    result.set(categoryId, (result.get(categoryId) ?? 0) - amount);
  }
  return result;
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
    transaction.payload.scheduledTransactionId !== null ||
    transaction.payload.amount !== transaction.payload.cashAmount ||
    transaction.payload.creditAmount !== 0 ||
    transaction.payload.creditAmountAdjusted !== 0 ||
    transaction.payload.subcategoryCreditAmountPreceding !== 0 ||
    (transaction.payload.cleared !== 'Cleared' &&
      transaction.payload.cleared !== 'Uncleared') ||
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

function scheduledOccurrenceAmount(
  transaction: BudgetEntity,
  entities: readonly BudgetEntity[],
  accounts: readonly BudgetEntity[],
  currentMonth: string,
): number {
  const parentId = requireString(transaction.payload.scheduledTransactionId);
  const transactionDate = requireIsoDate(transaction.payload.date);
  const parent = entities.find(
    entity =>
      entity.entityKind === 'be_scheduled_transactions' &&
      entity.entityId === parentId,
  );
  if (
    !parent ||
    !accounts.some(
      account => account.entityId === transaction.payload.accountId,
    ) ||
    transaction.entityId !== `${parentId}_${transactionDate}` ||
    transaction.payload.accountId !== parent.payload.accountId ||
    transaction.payload.payeeId !== parent.payload.payeeId ||
    transaction.payload.subCategoryId !== parent.payload.subCategoryId ||
    transaction.payload.dateEnteredFromSchedule !== transaction.payload.date ||
    transaction.payload.amount !== transaction.payload.cashAmount ||
    transaction.payload.creditAmount !== 0 ||
    transaction.payload.creditAmountAdjusted !== 0 ||
    transaction.payload.subcategoryCreditAmountPreceding !== 0 ||
    transaction.payload.memo !== parent.payload.memo ||
    transaction.payload.cleared !== 'Uncleared' ||
    transaction.payload.accepted !== false ||
    transaction.payload.source !== 'Scheduler' ||
    transaction.payload.transferAccountId !== null ||
    transaction.payload.transferTransactionId !== null ||
    transaction.payload.transferSubtransactionId !== null ||
    transactionDate.slice(0, 7) !== currentMonth.slice(0, 7) ||
    !Number.isSafeInteger(transaction.payload.amount)
  ) {
    throw new Error('Unsupported scheduled occurrence calculation state');
  }
  return Number(transaction.payload.amount);
}

function capturedScheduledTransactions(
  entities: readonly BudgetEntity[],
): ReadonlyMap<
  string,
  readonly Readonly<{ amount: number; firstDate: string }>[]
> {
  const result = new Map<
    string,
    Readonly<{ amount: number; firstDate: string }>[]
  >();
  for (const parent of entities.filter(
    entity =>
      entity.entityKind === 'be_scheduled_transactions' && !entity.isTombstone,
  )) {
    const upcoming = parent.payload.upcomingInstances;
    if (
      parent.payload.frequency !== 'Monthly' ||
      !Array.isArray(upcoming) ||
      upcoming.length !== 1 ||
      parent.payload.flag !== null ||
      parent.payload.transferAccountId !== null ||
      parent.payload.debtTransactionType !== null
    ) {
      throw new Error('Unsupported scheduled parent calculation state');
    }
    const categoryId = requireString(parent.payload.subCategoryId);
    const rows = result.get(categoryId) ?? [];
    rows.push({
      amount: requireInteger(parent.payload.amount),
      firstDate: requireIsoDate(upcoming[0]),
    });
    result.set(categoryId, rows);
  }
  return result;
}

function validateTransferCalculationState(
  transfers: readonly BudgetEntity[],
  accounts: readonly BudgetEntity[],
) {
  const byId = new Map(transfers.map(item => [item.entityId, item]));
  if (transfers.length % 2 !== 0) {
    throw new Error('Transfers require complete reciprocal pairs');
  }
  for (const leg of transfers) {
    const reciprocal = byId.get(
      requireString(leg.payload.transferTransactionId),
    );
    if (
      !reciprocal ||
      reciprocal === leg ||
      !accounts.some(item => item.entityId === leg.payload.accountId) ||
      leg.payload.transferAccountId !== reciprocal.payload.accountId ||
      reciprocal.payload.transferAccountId !== leg.payload.accountId ||
      reciprocal.payload.transferTransactionId !== leg.entityId ||
      leg.payload.subCategoryId !== null ||
      reciprocal.payload.subCategoryId !== null ||
      leg.payload.date !== reciprocal.payload.date ||
      leg.payload.memo !== reciprocal.payload.memo ||
      !Number.isSafeInteger(leg.payload.amount) ||
      leg.payload.amount !== -Number(reciprocal.payload.amount)
    ) {
      throw new Error('Unsupported reciprocal transfer calculation state');
    }
  }
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

function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Checking-account calculation requires an integer');
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
