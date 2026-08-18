import { createHash } from 'node:crypto';

import type {
  PlanChangeSetResult,
  PlanChangeWriter,
  PlanEntity,
  PlanReader,
} from '@actual-app/semantic-core';

export type CreateCheckingAccountInput = {
  principalId: string;
  planId: string;
  originDeviceId: string;
  idempotencyKey: string;
  name: string;
  balance: number;
  startingBalanceDate: string;
};

export type AccountCreationService = {
  createCheckingAccount(
    input: CreateCheckingAccountInput,
  ): Promise<PlanChangeSetResult>;
};

export class AccountCreationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

type Dependencies = {
  planReader: PlanReader;
  changeWriter: PlanChangeWriter;
};

export function createAccountCreationService(
  dependencies: Dependencies,
): AccountCreationService {
  return {
    async createCheckingAccount(input) {
      validateInput(input);
      const snapshot = await dependencies.planReader.readPlan(
        input.principalId,
        input.planId,
      );
      if (!snapshot) {
        throw new AccountCreationError('plan-not-found');
      }

      const existingAccounts = snapshot.entities.filter(
        entity => entity.entityKind === 'be_accounts' && !entity.isTombstone,
      );
      const replayAccount = existingAccounts.find(
        entity => entity.payload.creationCommandKey === input.idempotencyKey,
      );
      const sortableIndex = replayAccount
        ? requireSortableIndex(replayAccount.payload.sortableIndex)
        : nextSortableIndex(existingAccounts);

      const startingBalancePayee = exactlyOne(
        snapshot.entities,
        entity =>
          entity.entityKind === 'be_payees' &&
          !entity.isTombstone &&
          entity.payload.internalName === 'StartingBalancePayee',
        'starting-balance-payee-unavailable',
      );
      const immediateIncomeCategory = exactlyOne(
        snapshot.entities,
        entity =>
          entity.entityKind === 'be_subcategories' &&
          !entity.isTombstone &&
          entity.payload.internalName === 'Category/__ImmediateIncome__',
        'immediate-income-category-unavailable',
      );

      const accountId = deterministicUuid(
        input.planId,
        input.idempotencyKey,
        'account',
      );
      const transferPayeeId = deterministicUuid(
        input.planId,
        input.idempotencyKey,
        'transfer-payee',
      );
      const startingBalanceId = deterministicUuid(
        input.planId,
        input.idempotencyKey,
        'starting-balance',
      );
      const response = {
        id: accountId,
        account_name: input.name.trim(),
        account_type: 'Checking',
        balance_millicents: input.balance,
        budget_id: input.planId,
      };
      return dependencies.changeWriter.commitChangeSet({
        changeSetId: `account-create:${input.planId}:${input.idempotencyKey}`,
        planId: input.planId,
        originDeviceId: input.originDeviceId,
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 0,
        expectedServerKnowledge: snapshot.serverKnowledge,
        schemaVersion: 1,
        idempotencyKey: input.idempotencyKey,
        payloadDigest: digest(input),
        changes: [
          accountEntity(
            snapshot.budgetVersionId,
            accountId,
            sortableIndex,
            input,
          ),
          transferPayeeEntity(
            snapshot.budgetVersionId,
            transferPayeeId,
            accountId,
            input,
          ),
          startingBalanceEntity(
            snapshot.budgetVersionId,
            startingBalanceId,
            accountId,
            startingBalancePayee.entityId,
            immediateIncomeCategory.entityId,
            input,
          ),
        ],
        response,
      });
    },
  };
}

function accountEntity(
  budgetVersionId: string,
  accountId: string,
  sortableIndex: number,
  input: CreateCheckingAccountInput,
): PlanEntity {
  return {
    entityKind: 'be_accounts',
    entityId: accountId,
    isTombstone: false,
    payload: {
      budgetVersionId,
      creationCommandKey: input.idempotencyKey,
      accountName: input.name.trim(),
      accountType: 'Checking',
      note: null,
      isClosed: false,
      onBudget: true,
      isFavorite: false,
      sortableIndex,
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
  budgetVersionId: string,
  payeeId: string,
  accountId: string,
  input: CreateCheckingAccountInput,
): PlanEntity {
  return {
    entityKind: 'be_payees',
    entityId: payeeId,
    isTombstone: false,
    payload: {
      budgetVersionId,
      accountId,
      enabled: true,
      name: `Transfer : ${input.name.trim()}`,
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

function nextSortableIndex(accounts: readonly PlanEntity[]): number {
  if (accounts.length === 0) {
    return 0;
  }
  const indexes = accounts.map(account =>
    requireSortableIndex(account.payload.sortableIndex),
  );
  const next = Math.max(...indexes) + 1;
  if (!Number.isSafeInteger(next)) {
    throw new AccountCreationError('invalid-account-sort-order');
  }
  return next;
}

function requireSortableIndex(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new AccountCreationError('invalid-account-sort-order');
  }
  return Number(value);
}

function startingBalanceEntity(
  budgetVersionId: string,
  transactionId: string,
  accountId: string,
  payeeId: string,
  subCategoryId: string,
  input: CreateCheckingAccountInput,
): PlanEntity {
  return {
    entityKind: 'be_transactions',
    entityId: transactionId,
    isTombstone: false,
    payload: {
      budgetVersionId,
      accountId,
      payeeId,
      subCategoryId,
      scheduledTransactionId: null,
      source: null,
      importedPayee: null,
      originalImportedPayee: null,
      providerCleansedPayee: null,
      date: input.startingBalanceDate,
      importedDate: null,
      dateEnteredFromSchedule: null,
      amount: input.balance,
      cashAmount: input.balance,
      creditAmount: 0,
      creditAmountAdjusted: 0,
      subcategoryCreditAmountPreceding: 0,
      memo: null,
      cleared: 'Cleared',
      accepted: true,
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

function validateInput(input: CreateCheckingAccountInput): void {
  if (
    !input.principalId ||
    !input.planId ||
    !input.originDeviceId ||
    !input.idempotencyKey ||
    !input.name.trim() ||
    !Number.isSafeInteger(input.balance) ||
    input.balance < 0 ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.startingBalanceDate) ||
    Number.isNaN(Date.parse(`${input.startingBalanceDate}T00:00:00.000Z`))
  ) {
    throw new AccountCreationError('invalid-account-creation-request');
  }
}

function exactlyOne(
  entities: readonly PlanEntity[],
  predicate: (entity: PlanEntity) => boolean,
  errorCode: string,
): PlanEntity {
  const matches = entities.filter(predicate);
  if (matches.length !== 1) {
    throw new AccountCreationError(errorCode);
  }
  return matches[0];
}

function deterministicUuid(...parts: string[]): string {
  const bytes = Buffer.from(
    createHash('sha256').update(parts.join('\u0000')).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function digest(input: CreateCheckingAccountInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        commandKind: 'create-checking-account',
        principalId: input.principalId,
        planId: input.planId,
        name: input.name.trim(),
        balance: input.balance,
        startingBalanceDate: input.startingBalanceDate,
      }),
    )
    .digest('hex');
}
