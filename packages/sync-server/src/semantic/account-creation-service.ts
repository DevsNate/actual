import { createHash } from 'node:crypto';

import type {
  CanonicalUnlinkedAccountGroup,
  BudgetChangeSetResult,
  BudgetEntity,
  BudgetReader,
  BudgetSnapshot,
  UnlinkedAccountCreationWriter,
} from '@actual-app/semantic-core';
import { buildUnlinkedCheckingAccount } from '@actual-app/semantic-core';

export type CreateCheckingAccountInput = {
  principalId: string;
  budgetId: string;
  originDeviceId: string;
  idempotencyKey: string;
  name: string;
  openingBalance: number;
  openingDate: string;
};

export type CreatedUnlinkedAccount = {
  accountId: string;
  budgetId: string;
  name: string;
  type: 'checking';
  openingBalance: number;
};

export type AccountCreationResult = Omit<BudgetChangeSetResult, 'response'> & {
  response: CreatedUnlinkedAccount;
};

export type AccountCreationService = {
  createUnlinkedCheckingAccount(
    input: CreateCheckingAccountInput,
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
  ): readonly BudgetEntity[];
};

export function createAccountCreationService(
  dependencies: Dependencies,
): AccountCreationService {
  return {
    async createUnlinkedCheckingAccount(input) {
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
      const group = buildUnlinkedCheckingAccount({
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
      });
      const response: CreatedUnlinkedAccount = {
        accountId,
        budgetId: input.budgetId,
        name: input.name.trim(),
        type: 'checking',
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
            ),
            response,
          },
        });
      return { ...result, response: parseCreatedAccount(result.response) };
    },
  };
}

function validateInput(input: CreateCheckingAccountInput): void {
  if (
    !input.principalId ||
    !input.budgetId ||
    !input.originDeviceId ||
    !input.idempotencyKey ||
    !input.name.trim() ||
    !Number.isSafeInteger(input.openingBalance) ||
    input.openingBalance < 0 ||
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

function digest(input: CreateCheckingAccountInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        commandKind: 'create-checking-account',
        principalId: input.principalId,
        budgetId: input.budgetId,
        name: input.name.trim(),
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
    value.type !== 'checking' ||
    !Number.isSafeInteger(value.openingBalance)
  ) {
    throw new AccountCreationError('invalid-account-creation-receipt');
  }
  return {
    accountId: value.accountId,
    budgetId: value.budgetId,
    name: value.name,
    type: value.type,
    openingBalance: Number(value.openingBalance),
  };
}
