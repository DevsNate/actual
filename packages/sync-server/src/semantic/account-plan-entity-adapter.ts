import type {
  CanonicalUnlinkedAccountGroup,
  PlanEntity,
  PlanSnapshot,
} from '@actual-app/semantic-core';

import {
  AccountCreationError,
  type AccountEntityAdapter,
} from './account-creation-service';

export const stockAccountPlanEntityAdapter: AccountEntityAdapter = {
  resolveCreationContext(snapshot, idempotencyKey) {
    const accounts = snapshot.entities.filter(
      (entity) => entity.entityKind === 'be_accounts' && !entity.isTombstone,
    );
    const replayAccount = accounts.find(
      (entity) => entity.payload.creationCommandKey === idempotencyKey,
    );
    const sortOrder = replayAccount
      ? requireSortOrder(replayAccount.payload.sortableIndex)
      : nextSortOrder(accounts);
    const startingBalancePayee = exactlyOne(
      snapshot,
      (entity) =>
        entity.entityKind === 'be_payees' &&
        !entity.isTombstone &&
        entity.payload.internalName === 'StartingBalancePayee',
      'starting-balance-payee-unavailable',
    );
    const immediateIncomeCategory = exactlyOne(
      snapshot,
      (entity) =>
        entity.entityKind === 'be_subcategories' &&
        !entity.isTombstone &&
        entity.payload.internalName === 'Category/__ImmediateIncome__',
      'immediate-income-category-unavailable',
    );
    return {
      budgetVersionId: snapshot.budgetVersionId,
      expectedServerKnowledge: snapshot.serverKnowledge,
      sortOrder,
      startingBalancePayeeId: startingBalancePayee.entityId,
      immediateIncomeCategoryId: immediateIncomeCategory.entityId,
    };
  },

  toPlanEntities(group, budgetVersionId, creationCommandKey) {
    return [
      accountEntity(group, budgetVersionId, creationCommandKey),
      transferPayeeEntity(group, budgetVersionId),
      startingBalanceEntity(group, budgetVersionId),
    ];
  },
};

function accountEntity(
  group: CanonicalUnlinkedAccountGroup,
  budgetVersionId: string,
  creationCommandKey: string,
): PlanEntity {
  const { account } = group;
  return {
    entityKind: 'be_accounts',
    entityId: account.id,
    isTombstone: false,
    payload: {
      budgetVersionId,
      creationCommandKey,
      accountName: account.name,
      accountType: 'Checking',
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
): PlanEntity {
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
      autoFillUserDefinedSubCategoryId: null,
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
): PlanEntity {
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
      cashAmount: startingBalance.amount,
      creditAmount: 0,
      creditAmountAdjusted: 0,
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

function nextSortOrder(accounts: readonly PlanEntity[]): number {
  if (accounts.length === 0) {
    return 0;
  }
  const next =
    Math.max(
      ...accounts.map((account) =>
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

function exactlyOne(
  snapshot: PlanSnapshot,
  predicate: (entity: PlanEntity) => boolean,
  errorCode: string,
): PlanEntity {
  const matches = snapshot.entities.filter(predicate);
  if (matches.length !== 1) {
    throw new AccountCreationError(errorCode);
  }
  return matches[0];
}
