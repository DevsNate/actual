import type {
  BudgetEntity,
  BudgetSnapshot,
  CanonicalUnlinkedAccountGroup,
} from '@actual-app/semantic-core';

import { AccountCreationError } from './account-creation-service';
import type { AccountEntityAdapter } from './account-creation-service';

export const stockAccountBudgetEntityAdapter: AccountEntityAdapter = {
  resolveCreationContext(snapshot, idempotencyKey) {
    const accounts = snapshot.entities.filter(
      entity => entity.entityKind === 'be_accounts' && !entity.isTombstone,
    );
    const replayAccount = accounts.find(
      entity => entity.payload.creationCommandKey === idempotencyKey,
    );
    const sortOrder = replayAccount
      ? requireSortOrder(replayAccount.payload.sortableIndex)
      : nextSortOrder(accounts);
    const startingBalancePayee = exactlyOne(
      snapshot,
      entity =>
        entity.entityKind === 'be_payees' &&
        !entity.isTombstone &&
        entity.payload.internalName === 'StartingBalancePayee',
      'starting-balance-payee-unavailable',
    );
    const immediateIncomeCategory = exactlyOne(
      snapshot,
      entity =>
        entity.entityKind === 'be_subcategories' &&
        !entity.isTombstone &&
        entity.payload.internalName === 'Category/__ImmediateIncome__',
      'immediate-income-category-unavailable',
    );
    const debtPaymentGroup = exactlyOne(
      snapshot,
      entity =>
        entity.entityKind === 'be_master_categories' &&
        !entity.isTombstone &&
        entity.payload.internalName === 'MasterCategory/__DebtPayment__',
      'debt-payment-category-group-unavailable',
    );
    const months = snapshot.entities
      .filter(
        entity =>
          entity.entityKind === 'be_monthly_budgets' && !entity.isTombstone,
      )
      .map(entity => requireMonth(entity.payload.month))
      .sort();
    if (months.length !== 2) {
      throw new AccountCreationError('account-creation-months-unavailable');
    }
    const paymentCategories = snapshot.entities.filter(
      entity =>
        entity.entityKind === 'be_subcategories' &&
        !entity.isTombstone &&
        entity.payload.masterCategoryId === debtPaymentGroup.entityId,
    );
    return {
      budgetVersionId: snapshot.budgetVersionId,
      expectedServerKnowledge: snapshot.serverKnowledge,
      sortOrder,
      startingBalancePayeeId: startingBalancePayee.entityId,
      immediateIncomeCategoryId: immediateIncomeCategory.entityId,
      debtPaymentCategoryGroupId: debtPaymentGroup.entityId,
      paymentCategorySortOrder: nextSortOrder(paymentCategories),
      currentMonth: months[0],
      nextMonth: months[1],
      existingTransactions: snapshot.entities.filter(
        entity =>
          entity.entityKind === 'be_transactions' && !entity.isTombstone,
      ),
    };
  },

  toBudgetEntities(group, budgetVersionId, creationCommandKey, context) {
    const entities = [
      accountEntity(group, budgetVersionId, creationCommandKey),
      transferPayeeEntity(group, budgetVersionId),
      startingBalanceEntity(group, budgetVersionId),
    ];
    if (group.paymentCategory && group.monthlyPaymentCategories) {
      if (!context) {
        throw new AccountCreationError('credit-creation-context-unavailable');
      }
      const creditTransactions = projectCreditPrecedingAmounts([
        ...context.existingTransactions,
        entities[2],
      ]);
      entities.push(
        paymentCategoryEntity(group, budgetVersionId),
        ...group.monthlyPaymentCategories.map(month =>
          monthlyPaymentCategoryEntity(group, month, budgetVersionId),
        ),
      );
      entities.splice(
        2,
        1,
        ...creditTransactions.filter(
          entity =>
            entity.entityId === group.startingBalance.id ||
            context.existingTransactions.some(
              current =>
                current.entityId === entity.entityId &&
                current.payload.subcategoryCreditAmountPreceding !==
                  entity.payload.subcategoryCreditAmountPreceding,
            ),
        ),
      );
    }
    return entities;
  },
};

function projectCreditPrecedingAmounts(
  transactions: readonly BudgetEntity[],
): readonly BudgetEntity[] {
  const supported = transactions.filter(
    transaction =>
      transaction.entityKind === 'be_transactions' &&
      !transaction.isTombstone &&
      typeof transaction.payload.date === 'string' &&
      typeof transaction.payload.subCategoryId === 'string' &&
      Number.isSafeInteger(transaction.payload.creditAmountAdjusted),
  );
  const ordered = [...supported].sort((left, right) =>
    `${left.payload.date}\u0000${left.entityId}`.localeCompare(
      `${right.payload.date}\u0000${right.entityId}`,
    ),
  );
  const precedingByCategory = new Map<string, number>();
  return ordered.map(transaction => {
    const categoryId = String(transaction.payload.subCategoryId);
    const preceding = precedingByCategory.get(categoryId) ?? 0;
    const creditAmount = Number(transaction.payload.creditAmountAdjusted);
    const next = preceding + creditAmount;
    if (!Number.isSafeInteger(next)) {
      throw new AccountCreationError('credit-preceding-amount-overflow');
    }
    precedingByCategory.set(categoryId, next);
    return {
      ...transaction,
      payload: {
        ...transaction.payload,
        subcategoryCreditAmountPreceding: preceding,
      },
    };
  });
}

function accountEntity(
  group: CanonicalUnlinkedAccountGroup,
  budgetVersionId: string,
  creationCommandKey: string,
): BudgetEntity {
  const { account } = group;
  return {
    entityKind: 'be_accounts',
    entityId: account.id,
    isTombstone: false,
    payload: {
      budgetVersionId,
      creationCommandKey,
      accountName: account.name,
      accountType: account.type === 'credit-card' ? 'CreditCard' : 'Checking',
      note: null,
      isClosed: account.isClosed,
      onBudget: account.isOnBudget,
      isFavorite: account.isFavorite,
      sortableIndex: account.sortOrder,
      sortableFavoriteIndex: 0,
      debtStartDate: null,
      debtAssetValues: null,
      lastReconciledAt: null,
      debtEscrowAmounts: null,
      debtInterestRates: null,
      debtMinimumPayments: null,
      debtOriginalBalance: null,
      lastPaymentPayeeId: null,
      debtMigratedFromAccountId: null,
    },
  };
}

function transferPayeeEntity(
  group: CanonicalUnlinkedAccountGroup,
  budgetVersionId: string,
): BudgetEntity {
  const { transferPayee } = group;
  return {
    entityKind: 'be_payees',
    entityId: transferPayee.id,
    isTombstone: false,
    payload: {
      budgetVersionId,
      accountId: transferPayee.accountId,
      enabled: transferPayee.isEnabled,
      name: transferPayee.name,
      internalName: null,
      autoFillSubCategoryId: null,
      autoFillUserDefinedSubcategoryId: null,
      autoFillMemo: null,
      autoFillAmount: 0,
      autoFillSubCategoryEnabled: true,
      autoFillAmountEnabled: false,
      autoFillMemoEnabled: false,
      renameOnImportEnabled: true,
    },
  };
}

function startingBalanceEntity(
  group: CanonicalUnlinkedAccountGroup,
  budgetVersionId: string,
): BudgetEntity {
  const { startingBalance } = group;
  return {
    entityKind: 'be_transactions',
    entityId: startingBalance.id,
    isTombstone: false,
    payload: {
      budgetVersionId,
      accountId: startingBalance.accountId,
      payeeId: startingBalance.payeeId,
      subCategoryId: startingBalance.categoryId,
      scheduledTransactionId: null,
      source: null,
      importedPayee: null,
      originalImportedPayee: null,
      providerCleansedPayee: null,
      date: startingBalance.date,
      importedDate: null,
      dateEnteredFromSchedule: null,
      amount: startingBalance.amount,
      cashAmount:
        group.account.type === 'credit-card' ? 0 : startingBalance.amount,
      creditAmount:
        group.account.type === 'credit-card' ? startingBalance.amount : 0,
      creditAmountAdjusted:
        group.account.type === 'credit-card' ? startingBalance.amount : 0,
      subcategoryCreditAmountPreceding: 0,
      memo: null,
      cleared: startingBalance.isCleared ? 'Cleared' : 'Uncleared',
      accepted: startingBalance.isApproved,
      checkNumber: null,
      flag: null,
      transferAccountId: null,
      transferTransactionId: null,
      transferSubtransactionId: null,
      matchedTransactionId: null,
      debtTransactionType: null,
      ynabId: null,
    },
  };
}

function paymentCategoryEntity(
  group: CanonicalUnlinkedAccountGroup,
  budgetVersionId: string,
): BudgetEntity {
  const category = group.paymentCategory!;
  return {
    entityKind: 'be_subcategories',
    entityId: category.id,
    isTombstone: false,
    payload: {
      budgetVersionId,
      name: category.name,
      note: null,
      type: 'DBT',
      masterCategoryId: category.groupId,
      accountId: category.accountId,
      sortableIndex: category.sortOrder,
      isHidden: false,
      internalName: null,
      goalType: null,
      goalCadence: null,
      goalDay: null,
      goalCadenceFrequency: null,
      goalNeedsWholeAmount: null,
      goalCreatedOn: null,
      goalTargetDate: null,
      goalTargetAmount: 0,
      monthlyFunding: 0,
    },
  };
}

function monthlyPaymentCategoryEntity(
  group: CanonicalUnlinkedAccountGroup,
  month: NonNullable<
    CanonicalUnlinkedAccountGroup['monthlyPaymentCategories']
  >[number],
  budgetVersionId: string,
): BudgetEntity {
  return {
    entityKind: 'be_monthly_subcategory_budgets',
    entityId: month.id,
    isTombstone: false,
    payload: {
      budgetVersionId,
      monthlyBudgetId: `mb/${month.month.slice(0, 7)}/${group.account.budgetId}`,
      subCategoryId: month.categoryId,
      month: month.month,
      budgeted: 0,
      goalSnoozedAt: null,
      note: null,
      overspendingHandling: 'AffectsBuffer',
    },
  };
}

function nextSortOrder(accounts: readonly BudgetEntity[]): number {
  if (accounts.length === 0) {
    return 0;
  }
  const next =
    Math.max(
      ...accounts.map(account =>
        requireSortOrder(account.payload.sortableIndex),
      ),
    ) + 1;
  if (!Number.isSafeInteger(next)) {
    throw new AccountCreationError('invalid-account-sort-order');
  }
  return next;
}

function requireSortOrder(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new AccountCreationError('invalid-account-sort-order');
  }
  return Number(value);
}

function requireMonth(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-01$/u.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  ) {
    throw new AccountCreationError('account-creation-months-unavailable');
  }
  return value;
}

function exactlyOne(
  snapshot: BudgetSnapshot,
  predicate: (entity: BudgetEntity) => boolean,
  errorCode: string,
): BudgetEntity {
  const matches = snapshot.entities.filter(predicate);
  if (matches.length !== 1) {
    throw new AccountCreationError(errorCode);
  }
  return matches[0];
}
