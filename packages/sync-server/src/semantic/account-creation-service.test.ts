import type {
  BudgetChangeSetCommand,
  BudgetReader,
  CommitUnlinkedAccountCreation,
} from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { stockAccountBudgetEntityAdapter } from './account-budget-entity-adapter';
import { createAccountCreationService } from './account-creation-service';

function fixture() {
  let sequence = 0;
  const snapshot = {
    budgetId: '11111111-1111-4111-8111-111111111111',
    budgetVersionId: '22222222-2222-4222-8222-222222222222',
    name: 'Plan',
    serverKnowledge: 2,
    currencyFormat: {},
    dateFormat: {},
    entities: [
      ...buildStockBudgetBootstrap({
        budgetId: '11111111-1111-4111-8111-111111111111',
        budgetVersionId: '22222222-2222-4222-8222-222222222222',
        principalId: 'principal-1',
        name: 'Plan',
        currencyFormat: {},
        dateFormat: {},
        createdOn: '2026-08-17',
        createdAtMilliseconds: Date.UTC(2026, 7, 17),
        allocateId: label => `${label}:${sequence++}`,
      }),
    ],
  };
  const budgetReader: BudgetReader = {
    readBudget: vi.fn().mockResolvedValue(snapshot),
  };
  let commit: CommitUnlinkedAccountCreation | undefined;
  const service = createAccountCreationService({
    budgetReader,
    entityAdapter: stockAccountBudgetEntityAdapter,
    accountWriter: {
      commitUnlinkedAccountCreation: vi.fn(async value => {
        commit = value;
        return {
          replayed: false,
          serverKnowledge: 4,
          endingDeviceKnowledge: 0,
          response: value.delivery.response,
        };
      }),
    },
  });
  return {
    service,
    snapshot,
    getCommand: (): BudgetChangeSetCommand | undefined => commit?.delivery,
    getAccountGroup: () => commit?.accountGroup,
  };
}

const input = {
  principalId: 'principal-1',
  budgetId: '11111111-1111-4111-8111-111111111111',
  originDeviceId: 'web-device-1',
  idempotencyKey: 'account-create-1',
  name: 'Account Capture 1',
  accountType: 'checking' as const,
  openingBalance: 123450,
  openingDate: '2026-08-17',
};

describe('account creation service', () => {
  test('commits the admitted account, transfer payee, and starting balance atomically', async () => {
    const { service, getCommand, getAccountGroup } = fixture();
    const result = await service.createUnlinkedAccount(input);
    const command = getCommand();

    expect(result.response).toMatchObject({
      accountId: expect.any(String),
      name: 'Account Capture 1',
      type: 'checking',
      openingBalance: 123450,
      budgetId: input.budgetId,
    });
    expect(command).toMatchObject({
      budgetId: input.budgetId,
      expectedServerKnowledge: 2,
      serverKnowledgeAdvance: 2,
      startingDeviceKnowledge: 0,
      endingDeviceKnowledge: 0,
      idempotencyKey: 'account-create-1',
    });
    expect(command?.changes).toHaveLength(3);
    expect(getAccountGroup()).toMatchObject({
      account: { budgetId: input.budgetId, name: 'Account Capture 1' },
      transferPayee: { name: 'Transfer : Account Capture 1' },
      startingBalance: { amount: 123450, date: '2026-08-17' },
    });
    const account = command?.changes.find(
      entity => entity.entityKind === 'be_accounts',
    );
    const transferPayee = command?.changes.find(
      entity =>
        entity.entityKind === 'be_payees' &&
        entity.payload.accountId === account?.entityId,
    );
    const startingBalance = command?.changes.find(
      entity => entity.entityKind === 'be_transactions',
    );
    expect(account?.payload).toMatchObject({
      accountName: 'Account Capture 1',
      accountType: 'Checking',
      onBudget: true,
      isClosed: false,
      sortableIndex: 0,
    });
    expect(transferPayee?.payload).toMatchObject({
      name: 'Transfer : Account Capture 1',
      enabled: true,
      autoFillSubCategoryEnabled: true,
      autoFillAmount: 0,
      renameOnImportEnabled: true,
    });
    expect(startingBalance?.payload).toMatchObject({
      accountId: account?.entityId,
      amount: 123450,
      cashAmount: 123450,
      creditAmount: 0,
      date: '2026-08-17',
      cleared: 'Cleared',
      accepted: true,
    });
    expect(account?.entityId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(transferPayee?.entityId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(startingBalance?.entityId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  test('allows another captured Checking account while required system entities remain exact', async () => {
    const first = fixture();
    first.snapshot.entities.push({
      entityKind: 'be_accounts',
      entityId: 'existing-account',
      isTombstone: false,
      payload: { sortableIndex: 0 },
    });
    await expect(
      first.service.createUnlinkedAccount(input),
    ).resolves.toMatchObject({
      response: { name: 'Account Capture 1' },
    });
    expect(
      first
        .getCommand()
        ?.changes.find(entity => entity.entityKind === 'be_accounts')?.payload
        .sortableIndex,
    ).toBe(1);

    const second = fixture();
    second.snapshot.entities.push(
      second.snapshot.entities.find(
        entity => entity.payload.internalName === 'StartingBalancePayee',
      )!,
    );
    await expect(
      second.service.createUnlinkedAccount(input),
    ).rejects.toMatchObject({
      code: 'starting-balance-payee-unavailable',
    });
  });

  test('builds the captured CreditCard aggregate with its DBT payment category', async () => {
    const { service, snapshot, getCommand, getAccountGroup } = fixture();
    const immediateIncomeId = snapshot.entities.find(
      entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
    )!.entityId;
    snapshot.entities.push(
      {
        entityKind: 'be_monthly_budgets',
        entityId: 'prior-month',
        isTombstone: false,
        payload: { month: '2026-07-01' },
      },
      {
        entityKind: 'be_transactions',
        entityId: '00000000-0000-4000-8000-000000000001',
        isTombstone: false,
        payload: {
          date: '2026-08-21',
          subCategoryId: immediateIncomeId,
          creditAmountAdjusted: -258000,
          subcategoryCreditAmountPreceding: 0,
        },
      },
      {
        entityKind: 'be_transactions',
        entityId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        isTombstone: false,
        payload: {
          date: '2026-08-21',
          subCategoryId: immediateIncomeId,
          creditAmountAdjusted: -321000,
          subcategoryCreditAmountPreceding: -258000,
        },
      },
    );
    const result = await service.createUnlinkedAccount({
      ...input,
      accountType: 'credit-card',
      name: 'CC Capture 3',
      openingBalance: -432100,
      openingDate: '2026-08-21',
    });

    expect(result.response).toMatchObject({
      type: 'credit-card',
      openingBalance: -432100,
    });
    expect(getCommand()?.changes).toHaveLength(7);
    expect(getAccountGroup()).toMatchObject({
      account: { type: 'credit-card', name: 'CC Capture 3' },
      startingBalance: { amount: -432100 },
      paymentCategory: { type: 'DBT', name: 'CC Capture 3' },
      monthlyPaymentCategories: [
        { month: '2026-08-01' },
        { month: '2026-09-01' },
      ],
    });
    const startingBalance = getCommand()?.changes.find(
      entity => entity.entityKind === 'be_transactions',
    );
    expect(startingBalance?.payload).toMatchObject({
      amount: -432100,
      cashAmount: 0,
      creditAmount: -432100,
      creditAmountAdjusted: -432100,
      subcategoryCreditAmountPreceding: -258000,
    });
    expect(
      getCommand()?.changes.find(
        entity => entity.entityId === 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      )?.payload.subcategoryCreditAmountPreceding,
    ).toBe(-690100);
    expect(
      getCommand()
        ?.changes.filter(
          entity => entity.entityKind === 'be_monthly_subcategory_budgets',
        )
        .map(entity => entity.payload.monthlyBudgetId),
    ).toEqual([
      `mb/2026-08/${snapshot.budgetVersionId}`,
      `mb/2026-09/${snapshot.budgetVersionId}`,
    ]);
  });

  test('rejects calendar dates that JavaScript would otherwise normalize', async () => {
    const { service } = fixture();
    await expect(
      service.createUnlinkedAccount({
        ...input,
        openingDate: '2026-02-31',
      }),
    ).rejects.toMatchObject({ code: 'invalid-account-creation-request' });
  });
});
