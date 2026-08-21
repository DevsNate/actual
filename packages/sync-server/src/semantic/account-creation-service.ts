import { createHash } from 'node:crypto';

import type {
  CanonicalUnlinkedAccountGroup,
  BudgetChangeSetResult,
  BudgetEntity,
  BudgetReader,
  BudgetSnapshot,
  UnlinkedAccountCreationWriter,
} from '@actual-app/semantic-core';
import {
  buildUnlinkedCheckingAccount,
  buildUnlinkedCreditCardAccount,
} from '@actual-app/semantic-core';

export type CreateUnlinkedAccountInput = {
  principalId: string;
  budgetId: string;
  originDeviceId: string;
  idempotencyKey: string;
  name: string;
  accountType: 'checking' | 'credit-card';
  openingBalance: number;
  openingDate: string;
};

export type CreatedUnlinkedAccount = {
  accountId: string;
  budgetId: string;
  name: string;
  type: 'checking' | 'credit-card';
  openingBalance: number;
};

export type AccountCreationResult = Omit<BudgetChangeSetResult, 'response'> & {
  response: CreatedUnlinkedAccount;
};

export type AccountCreationService = {
  createUnlinkedAccount(
    input: CreateUnlinkedAccountInput,
  ): Promise<AccountCreationResult>;
};

export class AccountCreationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

type Dependencies = {
  budgetReader: BudgetReader;
  accountWriter: UnlinkedAccountCreationWriter;
  entityAdapter: AccountEntityAdapter;
};

export type AccountCreationContext = {
  budgetVersionId: string;
  expectedServerKnowledge: number;
  sortOrder: number;
  startingBalancePayeeId: string;
  immediateIncomeCategoryId: string;
  debtPaymentCategoryGroupId: string;
  paymentCategorySortOrder: number;
  currentMonth: string;
  nextMonth: string;
  existingTransactions: readonly BudgetEntity[];
};

export type AccountEntityAdapter = {
  resolveCreationContext(
    snapshot: BudgetSnapshot,
    idempotencyKey: string,
  ): AccountCreationContext;
  toBudgetEntities(
    group: CanonicalUnlinkedAccountGroup,
    budgetVersionId: string,
    creationCommandKey: string,
    context?: AccountCreationContext,
  ): readonly BudgetEntity[];
};

export function createAccountCreationService(
  dependencies: Dependencies,
): AccountCreationService {
  return {
    async createUnlinkedAccount(input) {
      validateInput(input);
      const snapshot = await dependencies.budgetReader.readBudget(
        input.principalId,
        input.budgetId,
      );
      if (!snapshot) {
        throw new AccountCreationError('budget-not-found');
      }
      const context = dependencies.entityAdapter.resolveCreationContext(
        snapshot,
        input.idempotencyKey,
      );

      const accountId = deterministicUuid(
        input.budgetId,
        input.idempotencyKey,
        'account',
      );
      const transferPayeeId = deterministicUuid(
        input.budgetId,
        input.idempotencyKey,
        'transfer-payee',
      );
      const startingBalanceId = deterministicUuid(
        input.budgetId,
        input.idempotencyKey,
        'starting-balance',
      );
      const common = {
        budgetId: input.budgetId,
        accountId,
        transferPayeeId,
        startingBalanceId,
        startingBalancePayeeId: context.startingBalancePayeeId,
        immediateIncomeCategoryId: context.immediateIncomeCategoryId,
        name: input.name.trim(),
        openingBalance: input.openingBalance,
        openingDate: input.openingDate,
        sortOrder: context.sortOrder,
      };
      const group =
        input.accountType === 'credit-card'
          ? buildUnlinkedCreditCardAccount({
              ...common,
              paymentCategoryId: deterministicUuid(
                input.budgetId,
                input.idempotencyKey,
                'payment-category',
              ),
              debtPaymentCategoryGroupId: context.debtPaymentCategoryGroupId,
              paymentCategorySortOrder: context.paymentCategorySortOrder,
              currentMonth: context.currentMonth,
              nextMonth: context.nextMonth,
            })
          : buildUnlinkedCheckingAccount(common);
      const response: CreatedUnlinkedAccount = {
        accountId,
        budgetId: input.budgetId,
        name: input.name.trim(),
        type: input.accountType,
        openingBalance: input.openingBalance,
      };
      const result =
        await dependencies.accountWriter.commitUnlinkedAccountCreation({
          accountGroup: group,
          delivery: {
            changeSetId: `account-create:${input.budgetId}:${input.idempotencyKey}`,
            budgetId: input.budgetId,
            originDeviceId: input.originDeviceId,
            startingDeviceKnowledge: 0,
            endingDeviceKnowledge: 0,
            expectedServerKnowledge: context.expectedServerKnowledge,
            serverKnowledgeAdvance: 2,
            schemaVersion: 1,
            idempotencyKey: input.idempotencyKey,
            payloadDigest: digest(input),
            changes: dependencies.entityAdapter.toBudgetEntities(
              group,
              context.budgetVersionId,
              input.idempotencyKey,
              context,
            ),
            response,
          },
        });
      return { ...result, response: parseCreatedAccount(result.response) };
    },
  };
}

function validateInput(input: CreateUnlinkedAccountInput): void {
  if (
    !input.principalId ||
    !input.budgetId ||
    !input.originDeviceId ||
    !input.idempotencyKey ||
    !input.name.trim() ||
    !['checking', 'credit-card'].includes(input.accountType) ||
    !Number.isSafeInteger(input.openingBalance) ||
    (input.accountType === 'checking'
      ? input.openingBalance < 0
      : input.openingBalance > 0) ||
    !isIsoCalendarDate(input.openingDate)
  ) {
    throw new AccountCreationError('invalid-account-creation-request');
  }
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
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

function digest(input: CreateUnlinkedAccountInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        commandKind: 'create-unlinked-account',
        principalId: input.principalId,
        budgetId: input.budgetId,
        name: input.name.trim(),
        accountType: input.accountType,
        openingBalance: input.openingBalance,
        openingDate: input.openingDate,
      }),
    )
    .digest('hex');
}

function parseCreatedAccount(
  value: Readonly<Record<string, unknown>>,
): CreatedUnlinkedAccount {
  if (
    typeof value.accountId !== 'string' ||
    typeof value.budgetId !== 'string' ||
    typeof value.name !== 'string' ||
    !['checking', 'credit-card'].includes(String(value.type)) ||
    !Number.isSafeInteger(value.openingBalance)
  ) {
    throw new AccountCreationError('invalid-account-creation-receipt');
  }
  return {
    accountId: value.accountId,
    budgetId: value.budgetId,
    name: value.name,
    type: value.type as 'checking' | 'credit-card',
    openingBalance: Number(value.openingBalance),
  };
}
