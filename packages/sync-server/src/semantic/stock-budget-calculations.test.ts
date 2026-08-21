import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import { projectStockAdmittedAccountCalculations } from './stock-admitted-account-calculations';
import { projectStockFreshBudgetCalculations } from './stock-budget-calculations';

function createSnapshot() {
  let sequence = 0;
  const entities = [
    ...buildStockBudgetBootstrap({
      budgetId: 'plan-1',
      budgetVersionId: 'version-1',
      principalId: 'user-1',
      name: 'Plan',
      currencyFormat: {},
      dateFormat: {},
      createdOn: '2026-08-17',
      createdAtMilliseconds: Date.UTC(2026, 7, 17),
      allocateId: label => `${label}:${sequence++}`,
    }),
  ];
  return {
    budgetId: 'plan-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 1,
    currencyFormat: {},
    dateFormat: {},
    entities,
  };
}

describe('stock fresh-budget calculations', () => {
  test('projects the exact admitted calculated bootstrap defaults', () => {
    const result = projectStockFreshBudgetCalculations(createSnapshot());

    expect(result.be_monthly_budget_calculations).toHaveLength(2);
    expect(result.be_monthly_subcategory_budget_calculations).toHaveLength(28);
    expect(result.be_account_calculations).toEqual([]);
    expect(result.be_monthly_account_calculations).toEqual([]);
    expect(result.be_monthly_budget_calculations[0]).toMatchObject({
      id: expect.stringMatching(/^mbc\//u),
      entities_monthly_budget_id: expect.stringMatching(/^mb\//u),
      available_to_budget: 0,
      balance: 0,
      age_of_money: null,
      is_tombstone: false,
    });
    expect(
      Object.keys(result.be_monthly_budget_calculations[0]).sort(),
    ).toEqual(
      [
        'additional_to_be_budgeted',
        'age_of_money',
        'available_to_budget',
        'balance',
        'budgeted',
        'cash_outflows',
        'credit_outflows',
        'deferred_income',
        'entities_monthly_budget_id',
        'hidden_balance',
        'hidden_budgeted',
        'hidden_cash_outflows',
        'hidden_credit_outflows',
        'id',
        'immediate_income',
        'is_tombstone',
        'over_spent',
        'previous_income',
        'uncategorized_balance',
        'uncategorized_cash_outflows',
        'uncategorized_credit_outflows',
      ].sort(),
    );
    expect(result.be_monthly_subcategory_budget_calculations[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^mcbc\//u),
        entities_monthly_subcategory_budget_id:
          expect.stringMatching(/^mcb\//u),
        balance: 0,
        goal_target: 0,
        goal_under_funded: null,
        overspending_affects_buffer: true,
        is_tombstone: false,
      }),
    );
    expect(
      Object.keys(result.be_monthly_subcategory_budget_calculations[0]).sort(),
    ).toEqual(
      [
        'additional_to_be_budgeted',
        'all_spending',
        'all_spending_since_last_payment',
        'balance',
        'balance_previous_month',
        'budgeted_average',
        'budgeted_cash_outflows',
        'budgeted_credit_outflows',
        'budgeted_previous_month',
        'budgeted_spending',
        'cash_outflows',
        'credit_outflows',
        'entities_monthly_subcategory_budget_id',
        'goal_expected_completion',
        'goal_overall_funded',
        'goal_overall_left',
        'goal_overall_outflows',
        'goal_percentage_complete',
        'goal_target',
        'goal_under_funded',
        'id',
        'is_tombstone',
        'overspending_affects_buffer',
        'payment_average',
        'payment_previous_month',
        'positive_cash_outflows',
        'spent_average',
        'spent_previous_month',
        'unbudgeted_cash_outflows',
        'unbudgeted_credit_outflows',
        'upcoming_transactions',
        'upcoming_transactions_count',
        'upcoming_transactions_first_date',
      ].sort(),
    );
  });

  test('uses the captured deterministic identity transformations', () => {
    const result = projectStockFreshBudgetCalculations(createSnapshot());

    expect(
      result.be_monthly_budget_calculations.every(
        row =>
          String(row.id).replace(/^mbc\//u, 'mb/') ===
          row.entities_monthly_budget_id,
      ),
    ).toBe(true);
    expect(
      result.be_monthly_subcategory_budget_calculations.every(
        row =>
          String(row.id).replace(/^mcbc\//u, 'mcb/') ===
          row.entities_monthly_subcategory_budget_id,
      ),
    ).toBe(true);
  });

  test('fails closed when non-pristine state would require inferred formulas', () => {
    const snapshot = createSnapshot();
    expect(() =>
      projectStockFreshBudgetCalculations({
        ...snapshot,
        entities: [
          ...snapshot.entities,
          {
            entityKind: 'be_transactions',
            entityId: 'transaction-1',
            isTombstone: false,
            payload: {},
          },
        ],
      }),
    ).toThrow('do not support be_transactions');
  });
});

describe('stock admitted account calculations', () => {
  test('projects the captured credit-card payment account, category, and RTA rows', () => {
    const { snapshot, paymentCategoryId } = paymentCalculationFixture(12_340);

    const result = projectStockAdmittedAccountCalculations(snapshot);
    expect(result.be_account_calculations).toEqual([
      expect.objectContaining({
        entities_account_id: 'checking',
        cleared_balance: 901_300,
        uncleared_balance: 0,
        transaction_count: 6,
      }),
      expect.objectContaining({
        entities_account_id: 'credit',
        cleared_balance: -258_000,
        uncleared_balance: 20_860,
        transaction_count: 3,
      }),
    ]);
    expect(result.be_monthly_budget_calculations).toEqual([
      expect.objectContaining({
        immediate_income: 1_000_000,
        budgeted: 69_840,
        cash_outflows: -98_700,
        balance: -28_860,
        over_spent: -30_860,
        available_to_budget: 930_160,
      }),
      expect.objectContaining({
        balance: 2_000,
        available_to_budget: 899_300,
      }),
    ]);
    const paymentRows =
      result.be_monthly_subcategory_budget_calculations.filter(row =>
        String(row.entities_monthly_subcategory_budget_id).endsWith(
          paymentCategoryId,
        ),
      );
    expect(paymentRows).toEqual([
      expect.objectContaining({
        cash_outflows: -20_860,
        balance: -20_860,
        unbudgeted_cash_outflows: -20_860,
      }),
      expect.objectContaining({
        payment_previous_month: -20_860,
        balance_previous_month: -20_860,
        spent_average: 0,
        payment_average: -20_860,
      }),
    ]);
  });

  test('projects the captured payment edit, deletion, and unchanged replay', () => {
    const edited = paymentCalculationFixture(23_450);
    const editedRows = projectStockAdmittedAccountCalculations(edited.snapshot);
    expect(
      paymentCalculationSummary(editedRows, edited.paymentCategoryId),
    ).toEqual({
      checkingCleared: 890_190,
      creditUncleared: 31_970,
      currentAvailableToBudget: 930_160,
      nextAvailableToBudget: 888_190,
      currentCashOutflows: -109_810,
      currentPaymentBalance: -31_970,
      nextPaymentPrevious: -31_970,
    });

    const deleted = paymentCalculationFixture(null);
    const terminal = projectStockAdmittedAccountCalculations(deleted.snapshot);
    expect(
      paymentCalculationSummary(terminal, deleted.paymentCategoryId),
    ).toEqual({
      checkingCleared: 913_640,
      creditUncleared: 8_520,
      currentAvailableToBudget: 930_160,
      nextAvailableToBudget: 911_640,
      currentCashOutflows: -86_360,
      currentPaymentBalance: -8_520,
      nextPaymentPrevious: -8_520,
    });
    expect(projectStockAdmittedAccountCalculations(deleted.snapshot)).toEqual(
      terminal,
    );
  });

  test('projects the admitted starting-balance and rolling-balance rows', () => {
    const snapshot = createSnapshot();
    const startingPayee = snapshot.entities.find(
      entity => entity.payload.internalName === 'StartingBalancePayee',
    )!;
    const immediateIncome = snapshot.entities.find(
      entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
    )!;
    snapshot.entities.push(
      {
        entityKind: 'be_accounts',
        entityId: 'account-1',
        isTombstone: false,
        payload: {
          accountName: 'Account Capture 1',
          accountType: 'Checking',
          onBudget: true,
          isClosed: false,
        },
      },
      {
        entityKind: 'be_payees',
        entityId: 'transfer-payee-1',
        isTombstone: false,
        payload: {
          accountId: 'account-1',
          name: 'Transfer : Account Capture 1',
          enabled: true,
          autoFillSubCategoryEnabled: true,
          autoFillAmount: 0,
          autoFillAmountEnabled: false,
          autoFillMemoEnabled: false,
          renameOnImportEnabled: true,
        },
      },
      {
        entityKind: 'be_transactions',
        entityId: 'starting-balance-1',
        isTombstone: false,
        payload: {
          accountId: 'account-1',
          payeeId: startingPayee.entityId,
          subCategoryId: immediateIncome.entityId,
          date: '2026-08-17',
          amount: 123450,
          cashAmount: 123450,
          creditAmount: 0,
          memo: null,
          cleared: 'Cleared',
          accepted: true,
          transferAccountId: null,
          transferTransactionId: null,
          transferSubtransactionId: null,
        },
      },
    );

    const result = projectStockAdmittedAccountCalculations(snapshot);
    expect(result.be_account_calculations).toEqual([
      expect.objectContaining({
        id: 'ac/account-1',
        cleared_balance: 123450,
        uncleared_balance: 0,
        transaction_count: 1,
      }),
    ]);
    expect(Object.keys(result.be_account_calculations[0]).sort()).toEqual(
      [
        'cleared_balance',
        'debt_last_payment_date',
        'debt_payments',
        'entities_account_id',
        'error_count',
        'id',
        'info_count',
        'is_tombstone',
        'transaction_count',
        'uncleared_balance',
        'warning_count',
      ].sort(),
    );
    expect(result.be_monthly_account_calculations).toHaveLength(2);
    expect(result.be_monthly_account_calculations[0]).toMatchObject({
      cleared_balance: 123450,
      rolling_balance: 123450,
      transaction_count: 1,
    });
    expect(result.be_monthly_account_calculations[1]).toMatchObject({
      cleared_balance: 0,
      rolling_balance: 123450,
      transaction_count: 0,
    });
    expect(
      Object.keys(result.be_monthly_account_calculations[0]).sort(),
    ).toEqual(
      [
        'cleared_balance',
        'debt_escrow_paid',
        'debt_estimated_escrow_paid',
        'debt_estimated_interest_paid',
        'debt_interest_due',
        'debt_interest_paid',
        'debt_last_payment_date',
        'debt_payments',
        'entities_account_id',
        'error_count',
        'id',
        'info_count',
        'is_tombstone',
        'month',
        'rolling_balance',
        'transaction_count',
        'uncleared_balance',
        'warning_count',
      ].sort(),
    );
    expect(result.be_monthly_budget_calculations).toEqual([
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
      result.be_monthly_subcategory_budget_calculations.filter(row =>
        String(row.entities_monthly_subcategory_budget_id).endsWith(
          immediateIncome.entityId,
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        cash_outflows: 123450,
        positive_cash_outflows: 123450,
        balance: 123450,
        budgeted_cash_outflows: 123450,
        goal_overall_outflows: 123450,
      }),
      expect.objectContaining({
        cash_outflows: 0,
        balance: 123450,
        spent_previous_month: 123450,
        balance_previous_month: 123450,
        spent_average: 123450,
      }),
    ]);

    for (const [suffix, amount] of [
      ['2', 234560],
      ['3', 345670],
    ] as const) {
      snapshot.entities.push(
        {
          entityKind: 'be_accounts',
          entityId: `account-${suffix}`,
          isTombstone: false,
          payload: {
            accountName: `Account Capture ${suffix}`,
            accountType: 'Checking',
            onBudget: true,
            isClosed: false,
          },
        },
        {
          entityKind: 'be_payees',
          entityId: `transfer-payee-${suffix}`,
          isTombstone: false,
          payload: {
            accountId: `account-${suffix}`,
            name: `Transfer : Account Capture ${suffix}`,
            enabled: true,
            autoFillSubCategoryEnabled: true,
            autoFillAmount: 0,
            autoFillAmountEnabled: false,
            autoFillMemoEnabled: false,
            renameOnImportEnabled: true,
          },
        },
        {
          entityKind: 'be_transactions',
          entityId: `starting-balance-${suffix}`,
          isTombstone: false,
          payload: {
            accountId: `account-${suffix}`,
            payeeId: startingPayee.entityId,
            subCategoryId: immediateIncome.entityId,
            date: '2026-08-17',
            amount,
            cashAmount: amount,
            creditAmount: 0,
            memo: null,
            cleared: 'Cleared',
            accepted: true,
            transferAccountId: null,
            transferTransactionId: null,
            transferSubtransactionId: null,
          },
        },
      );
    }

    const multiple = projectStockAdmittedAccountCalculations(snapshot);
    expect(multiple.be_account_calculations).toHaveLength(3);
    expect(multiple.be_monthly_account_calculations).toHaveLength(6);
    expect(
      multiple.be_account_calculations.map(row => row.cleared_balance),
    ).toEqual([123450, 234560, 345670]);
    expect(multiple.be_monthly_budget_calculations).toEqual([
      expect.objectContaining({
        immediate_income: 703680,
        available_to_budget: 703680,
      }),
      expect.objectContaining({
        immediate_income: 0,
        available_to_budget: 703680,
      }),
    ]);
    expect(
      multiple.be_monthly_subcategory_budget_calculations.filter(row =>
        String(row.entities_monthly_subcategory_budget_id).endsWith(
          immediateIncome.entityId,
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        cash_outflows: 703680,
        positive_cash_outflows: 703680,
        balance: 703680,
        budgeted_cash_outflows: 703680,
        goal_overall_outflows: 703680,
      }),
      expect.objectContaining({
        cash_outflows: 0,
        balance: 703680,
        spent_previous_month: 703680,
        balance_previous_month: 703680,
        spent_average: 703680,
      }),
    ]);
  });

  test('projects the captured monthly parent and scheduler occurrence separately', () => {
    const snapshot = createSnapshot();
    const startingPayee = snapshot.entities.find(
      entity => entity.payload.internalName === 'StartingBalancePayee',
    )!;
    const immediateIncome = snapshot.entities.find(
      entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
    )!;
    const category = snapshot.entities.find(
      entity =>
        entity.entityKind === 'be_subcategories' &&
        entity.payload.internalName === null &&
        (entity.payload.accountId ?? null) === null,
    )!;
    snapshot.entities.push(
      account('checking', 'Cash'),
      transferPayee('checking'),
      {
        entityKind: 'be_payees',
        entityId: 'schedule-payee',
        isTombstone: false,
        payload: { accountId: null, enabled: true, name: 'Schedule Payee' },
      },
      transaction('checking-start', 'checking', 100_000, {
        payeeId: startingPayee.entityId,
        subCategoryId: immediateIncome.entityId,
        cleared: 'Cleared',
      }),
      {
        entityKind: 'be_scheduled_transactions',
        entityId: 'schedule-1',
        isTombstone: false,
        payload: {
          accountId: 'checking',
          payeeId: 'schedule-payee',
          subCategoryId: category.entityId,
          date: '2026-08-17',
          frequency: 'Monthly',
          amount: -15_000,
          memo: 'Schedule Test 2',
          flag: null,
          transferAccountId: null,
          upcomingInstances: ['2026-08-17'],
          debtTransactionType: null,
        },
      },
    );

    const parentOnly = projectStockAdmittedAccountCalculations(snapshot);
    const rows = parentOnly.be_monthly_subcategory_budget_calculations.filter(
      row =>
        String(row.entities_monthly_subcategory_budget_id).endsWith(
          category.entityId,
        ),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        upcoming_transactions: -15_000,
        upcoming_transactions_count: 1,
        upcoming_transactions_first_date: '2026-08-17',
      }),
      expect.objectContaining({
        upcoming_transactions: -15_000,
        upcoming_transactions_count: 1,
        upcoming_transactions_first_date: '2026-09-17',
      }),
    ]);

    snapshot.entities.push(
      transaction('schedule-1_2026-08-16', 'checking', -15_000, {
        payeeId: 'schedule-payee',
        subCategoryId: category.entityId,
        scheduledTransactionId: 'schedule-1',
        date: '2026-08-16',
        dateEnteredFromSchedule: '2026-08-16',
        memo: 'Schedule Test 2',
        accepted: false,
        source: 'Scheduler',
      }),
    );
    const withOccurrence = projectStockAdmittedAccountCalculations(snapshot);
    expect(
      withOccurrence.be_monthly_subcategory_budget_calculations.find(row =>
        String(row.entities_monthly_subcategory_budget_id).endsWith(
          category.entityId,
        ),
      ),
    ).toEqual(expect.objectContaining({ cash_outflows: -15_000 }));
    expect(withOccurrence.be_account_calculations[0]).toEqual(
      expect.objectContaining({
        uncleared_balance: -15_000,
        transaction_count: 2,
      }),
    );
  });
});

function paymentCalculationFixture(newPaymentAmount: number | null) {
  const snapshot = createSnapshot();
  const startingPayee = snapshot.entities.find(
    entity => entity.payload.internalName === 'StartingBalancePayee',
  )!;
  const immediateIncome = snapshot.entities.find(
    entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
  )!;
  const ordinaryCategory = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_subcategories' &&
      entity.payload.internalName === null &&
      (entity.payload.accountId ?? null) === null,
  )!;
  const masterCategory = snapshot.entities.find(
    entity => entity.entityKind === 'be_master_categories',
  )!;
  const monthlyBudgets = snapshot.entities.filter(
    entity =>
      entity.entityKind === 'be_monthly_budgets' &&
      entity.payload.bootstrapRole !== 'opened-budget-prior-month',
  );
  const paymentCategoryId = 'category-payment';
  const newPayment =
    newPaymentAmount === null
      ? []
      : [
          transferLeg(
            'payment-new-out',
            'checking',
            'credit',
            -newPaymentAmount,
          ),
          transferLeg('payment-new-in', 'credit', 'checking', newPaymentAmount),
        ];
  snapshot.entities.push(
    account('checking', 'Cash'),
    account('credit', 'CreditCard'),
    transferPayee('checking'),
    transferPayee('credit'),
    transaction('checking-start', 'checking', 1_000_000, {
      payeeId: startingPayee.entityId,
      subCategoryId: immediateIncome.entityId,
      cashAmount: 1_000_000,
      creditAmount: 0,
      cleared: 'Cleared',
    }),
    transaction('credit-start', 'credit', -258_000, {
      payeeId: startingPayee.entityId,
      subCategoryId: immediateIncome.entityId,
      cashAmount: 0,
      creditAmount: -258_000,
      creditAmountAdjusted: -258_000,
      cleared: 'Cleared',
    }),
    transaction('uncategorized', 'checking', -10_000, {
      cleared: 'Cleared',
    }),
    transaction('categorized', 'checking', -67_000, {
      subCategoryId: ordinaryCategory.entityId,
      cleared: 'Cleared',
    }),
    transaction('categorized-small', 'checking', -840, {
      subCategoryId: ordinaryCategory.entityId,
      cleared: 'Cleared',
    }),
    transferLeg('payment-old-out', 'checking', 'credit', -8_520),
    transferLeg('payment-old-in', 'credit', 'checking', 8_520),
    ...newPayment,
    {
      entityKind: 'be_subcategories',
      entityId: paymentCategoryId,
      isTombstone: false,
      payload: {
        name: 'Credit',
        type: 'DBT',
        accountId: 'credit',
        masterCategoryId: masterCategory.entityId,
        internalName: null,
      },
    },
    ...monthlyBudgets.map(month => ({
      entityKind: 'be_monthly_subcategory_budgets',
      entityId: `mcb/${String(month.payload.month).slice(0, 7)}/${paymentCategoryId}`,
      isTombstone: false,
      payload: {
        monthlyBudgetId: month.entityId,
        subCategoryId: paymentCategoryId,
        budgeted: 0,
      },
    })),
  );
  const currentOrdinaryBudget = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_monthly_subcategory_budgets' &&
      entity.payload.monthlyBudgetId === monthlyBudgets[0].entityId &&
      entity.payload.subCategoryId === ordinaryCategory.entityId,
  )!;
  currentOrdinaryBudget.payload = {
    ...currentOrdinaryBudget.payload,
    budgeted: 69_840,
  };
  return { snapshot, paymentCategoryId };
}

function paymentCalculationSummary(
  result: ReturnType<typeof projectStockAdmittedAccountCalculations>,
  paymentCategoryId: string,
) {
  const accountRow = (id: string) =>
    result.be_account_calculations.find(row => row.entities_account_id === id)!;
  const budgets = [...result.be_monthly_budget_calculations].sort(
    (left, right) =>
      String(left.entities_monthly_budget_id).localeCompare(
        String(right.entities_monthly_budget_id),
      ),
  );
  const payments = result.be_monthly_subcategory_budget_calculations
    .filter(row =>
      String(row.entities_monthly_subcategory_budget_id).endsWith(
        paymentCategoryId,
      ),
    )
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return {
    checkingCleared: accountRow('checking').cleared_balance,
    creditUncleared: accountRow('credit').uncleared_balance,
    currentAvailableToBudget: budgets[0].available_to_budget,
    nextAvailableToBudget: budgets[1].available_to_budget,
    currentCashOutflows: budgets[0].cash_outflows,
    currentPaymentBalance: payments[0].balance,
    nextPaymentPrevious: payments[1].payment_previous_month,
  };
}

function account(id: string, type: 'Cash' | 'CreditCard') {
  return {
    entityKind: 'be_accounts',
    entityId: id,
    isTombstone: false,
    payload: {
      accountName: id,
      accountType: type,
      onBudget: true,
      isClosed: false,
    },
  };
}

function transferPayee(accountId: string) {
  return {
    entityKind: 'be_payees',
    entityId: `payee-${accountId}`,
    isTombstone: false,
    payload: {
      accountId,
      name: `Transfer : ${accountId}`,
      enabled: true,
      autoFillSubCategoryEnabled: true,
      autoFillAmount: 0,
      autoFillAmountEnabled: false,
      autoFillMemoEnabled: false,
      renameOnImportEnabled: true,
    },
  };
}

function transaction(
  id: string,
  accountId: string,
  amount: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    entityKind: 'be_transactions',
    entityId: id,
    isTombstone: false,
    payload: {
      accountId,
      payeeId: 'ordinary-payee',
      subCategoryId: null,
      scheduledTransactionId: null,
      date: '2026-08-21',
      amount,
      cashAmount: amount,
      creditAmount: 0,
      creditAmountAdjusted: 0,
      subcategoryCreditAmountPreceding: 0,
      memo: null,
      cleared: 'Uncleared',
      accepted: true,
      transferAccountId: null,
      transferTransactionId: null,
      transferSubtransactionId: null,
      ...overrides,
    },
  };
}

function transferLeg(
  id: string,
  accountId: string,
  otherAccountId: string,
  amount: number,
) {
  const otherId = id.endsWith('-out')
    ? id.replace(/-out$/u, '-in')
    : id.replace(/-in$/u, '-out');
  return transaction(id, accountId, amount, {
    payeeId: `payee-${otherAccountId}`,
    cashAmount: accountId === 'credit' ? 0 : amount,
    creditAmount: accountId === 'credit' ? amount : 0,
    creditAmountAdjusted: accountId === 'credit' ? amount : 0,
    transferAccountId: otherAccountId,
    transferTransactionId: otherId,
    cleared: accountId === 'checking' ? 'Cleared' : 'Uncleared',
  });
}
