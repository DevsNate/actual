import type { PlanEntity, PlanSnapshot } from '@actual-app/semantic-core';
import { buildStockPlanBootstrap } from '@actual-app/semantic-core';

import { projectStockEntity } from './stock-budget-projection';
import { parseStockPristineAccountDelete } from './stock-pristine-account-delete';

describe('stock pristine account delete', () => {
  test('accepts exact account, bound-payee, and Starting Balance tombstones', () => {
    const snapshot = fixture();
    const account = find(snapshot, 'be_accounts', 'account-2');
    const payee = find(snapshot, 'be_payees', 'transfer-payee-2');
    const transaction = find(snapshot, 'be_transactions', 'balance-2');
    const result = parseStockPristineAccountDelete(
      {
        be_accounts: [tombstone(account)],
        be_payees: [tombstone(payee)],
        be_transaction_groups: [
          {
            id: transaction.entityId,
            be_transaction: tombstone(transaction),
            be_subtransactions: null,
          },
        ],
      },
      snapshot,
    );

    expect(result?.changes).toEqual([
      expect.objectContaining({ entityId: 'account-2', isTombstone: true }),
      expect.objectContaining({
        entityId: 'transfer-payee-2',
        isTombstone: true,
      }),
      expect.objectContaining({ entityId: 'balance-2', isTombstone: true }),
    ]);
    expect(result?.changedEntities.be_account_calculations).toEqual([
      expect.objectContaining({
        id: 'ac/account-2',
        is_tombstone: true,
        cleared_balance: 0,
        transaction_count: 0,
      }),
    ]);
    expect(result?.changedEntities.be_monthly_account_calculations).toEqual([
      expect.objectContaining({ is_tombstone: true, rolling_balance: 0 }),
      expect.objectContaining({ is_tombstone: true, rolling_balance: 0 }),
    ]);
    expect(result?.changedEntities.be_monthly_budget_calculations).toEqual([
      expect.objectContaining({
        immediate_income: 123450,
        available_to_budget: 123450,
      }),
      expect.objectContaining({
        immediate_income: 0,
        available_to_budget: 123450,
      }),
    ]);

    expect(
      parseStockPristineAccountDelete(
        {
          be_accounts: [tombstone(account)],
          be_payees: [tombstone(payee)],
          be_transaction_groups: [
            {
              id: transaction.entityId,
              be_transaction: {
                ...tombstone(transaction),
                amount: 1,
              },
              be_subtransactions: null,
            },
          ],
        },
        snapshot,
      ),
    ).toBeNull();
  });
});

function fixture(): PlanSnapshot {
  let sequence = 0;
  const entities = [
    ...buildStockPlanBootstrap({
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      principalId: 'principal-1',
      name: 'Plan',
      currencyFormat: {},
      dateFormat: {},
      createdOn: '2026-08-17',
      createdAtMilliseconds: Date.UTC(2026, 7, 17),
      allocateId: label => `${label}:${sequence++}`,
    }),
  ];
  const startingPayee = entities.find(
    entity => entity.payload.internalName === 'StartingBalancePayee',
  )!;
  const immediateIncome = entities.find(
    entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
  )!;
  addAccount(entities, startingPayee, immediateIncome, '1', 123450, 0);
  addAccount(entities, startingPayee, immediateIncome, '2', 345670, 1);
  return {
    planId: 'plan-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 37,
    currencyFormat: {},
    dateFormat: {},
    entities,
  };
}

function addAccount(
  entities: PlanEntity[],
  startingPayee: PlanEntity,
  immediateIncome: PlanEntity,
  suffix: string,
  amount: number,
  sortableIndex: number,
): void {
  entities.push(
    {
      entityKind: 'be_accounts',
      entityId: `account-${suffix}`,
      isTombstone: false,
      payload: {
        budgetVersionId: 'version-1',
        creationCommandKey: `create-${suffix}`,
        accountName: `Account ${suffix}`,
        accountType: 'Checking',
        note: null,
        lastPaymentPayeeId: null,
        isClosed: false,
        sortableIndex,
        isFavorite: false,
        sortableFavoriteIndex: 0,
        onBudget: true,
        lastReconciledAt: null,
        debtStartDate: null,
        debtOriginalBalance: null,
        debtInterestRates: null,
        debtMinimumPayments: null,
        debtAssetValues: null,
        debtEscrowAmounts: null,
        debtMigratedFromAccountId: null,
      },
    },
    {
      entityKind: 'be_payees',
      entityId: `transfer-payee-${suffix}`,
      isTombstone: false,
      payload: {
        budgetVersionId: 'version-1',
        accountId: `account-${suffix}`,
        enabled: true,
        autoFillSubCategoryId: null,
        autoFillUserDefinedSubCategoryId: null,
        autoFillMemo: null,
        autoFillAmount: 0,
        autoFillSubCategoryEnabled: true,
        autoFillMemoEnabled: false,
        autoFillAmountEnabled: false,
        renameOnImportEnabled: true,
        name: `Transfer : Account ${suffix}`,
        internalName: null,
      },
    },
    {
      entityKind: 'be_transactions',
      entityId: `balance-${suffix}`,
      isTombstone: false,
      payload: {
        budgetVersionId: 'version-1',
        accountId: `account-${suffix}`,
        payeeId: startingPayee.entityId,
        subCategoryId: immediateIncome.entityId,
        scheduledTransactionId: null,
        date: '2026-08-17',
        dateEnteredFromSchedule: null,
        amount,
        cashAmount: amount,
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
        ynabId: null,
        importedPayee: null,
        importedDate: null,
        originalImportedPayee: null,
        providerCleansedPayee: null,
        source: null,
        debtTransactionType: null,
      },
    },
  );
}

function tombstone(entity: PlanEntity): Readonly<Record<string, unknown>> {
  return { ...projectStockEntity(entity), is_tombstone: true };
}

function find(snapshot: PlanSnapshot, kind: string, id: string): PlanEntity {
  return snapshot.entities.find(
    entity => entity.entityKind === kind && entity.entityId === id,
  )!;
}
