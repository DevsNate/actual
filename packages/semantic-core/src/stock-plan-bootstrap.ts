import type { PlanEntity } from './plan';

export type StockPlanBootstrapInput = {
  planId: string;
  budgetVersionId: string;
  principalId: string;
  name: string;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
  createdOn: string;
  createdAtMilliseconds: number;
  allocateId(label: string): string;
};

type MasterDefinition = {
  key: string;
  internalName: string;
  deletable: boolean;
  sortableIndex: number;
  name: string;
};

type CategoryDefinition = {
  key: string;
  masterKey: string;
  internalName: string | null;
  sortableIndex: number;
  type: string | null;
  name: string;
  goalType?: string;
  goalCadence?: number;
  goalDay?: number;
  goalCadenceFrequency?: number;
  goalNeedsWholeAmount?: boolean;
  subscriptionTarget?: boolean;
};

const masters: readonly MasterDefinition[] = [
  {
    key: 'internal',
    internalName: 'MasterCategory/__Internal__',
    deletable: false,
    sortableIndex: 0,
    name: 'Internal Master Category',
  },
  {
    key: 'debt',
    internalName: 'MasterCategory/__DebtPayment__',
    deletable: false,
    sortableIndex: 10000,
    name: 'Credit Card Payments',
  },
  {
    key: 'bills',
    internalName: 'MasterCategory/__Bills__',
    deletable: true,
    sortableIndex: 20000,
    name: 'Bills',
  },
  {
    key: 'needs',
    internalName: 'MasterCategory/__Needs__',
    deletable: true,
    sortableIndex: 30000,
    name: 'Needs',
  },
  {
    key: 'wants',
    internalName: 'MasterCategory/__Wants__',
    deletable: true,
    sortableIndex: 40000,
    name: 'Wants',
  },
  {
    key: 'hidden',
    internalName: 'MasterCategory/__Hidden__',
    deletable: false,
    sortableIndex: 80000,
    name: 'Hidden Categories',
  },
];

const categories: readonly CategoryDefinition[] = [
  {
    key: 'income',
    masterKey: 'internal',
    internalName: 'Category/__ImmediateIncome__',
    sortableIndex: 30000,
    type: null,
    name: 'Immediate Income SubCategory',
  },
  {
    key: 'split',
    masterKey: 'internal',
    internalName: 'Category/__Split__',
    sortableIndex: 40000,
    type: null,
    name: 'Split (Multiple Categories)...',
  },
  {
    key: 'none',
    masterKey: 'internal',
    internalName: 'Category/__None__',
    sortableIndex: 50000,
    type: null,
    name: 'None',
  },
  {
    key: 'rent',
    masterKey: 'bills',
    internalName: null,
    sortableIndex: 80000,
    type: 'DFT',
    name: '🏠 Rent/Mortgage',
  },
  {
    key: 'phone',
    masterKey: 'bills',
    internalName: null,
    sortableIndex: 90000,
    type: 'DFT',
    name: '📱 Phone & Internet',
  },
  {
    key: 'utilities',
    masterKey: 'bills',
    internalName: null,
    sortableIndex: 100000,
    type: 'DFT',
    name: '⚡️ Utilities',
  },
  {
    key: 'groceries',
    masterKey: 'needs',
    internalName: null,
    sortableIndex: 120000,
    type: 'DFT',
    name: '🛒 Groceries',
    goalType: 'NEED',
    goalCadence: 2,
    goalDay: 6,
    goalCadenceFrequency: 1,
    goalNeedsWholeAmount: true,
  },
  {
    key: 'transportation',
    masterKey: 'needs',
    internalName: null,
    sortableIndex: 130000,
    type: 'DFT',
    name: '🚘 Transportation',
    goalType: 'NEED',
    goalCadence: 2,
    goalDay: 6,
    goalCadenceFrequency: 1,
    goalNeedsWholeAmount: true,
  },
  {
    key: 'medical',
    masterKey: 'needs',
    internalName: null,
    sortableIndex: 140000,
    type: 'DFT',
    name: '🩺 Medical expenses',
    goalType: 'TB',
  },
  {
    key: 'emergency',
    masterKey: 'needs',
    internalName: null,
    sortableIndex: 150000,
    type: 'DFT',
    name: '😌 Emergency fund',
    goalType: 'TB',
  },
  {
    key: 'dining',
    masterKey: 'wants',
    internalName: null,
    sortableIndex: 170000,
    type: 'DFT',
    name: '🍽️ Dining out',
  },
  {
    key: 'entertainment',
    masterKey: 'wants',
    internalName: null,
    sortableIndex: 180000,
    type: 'DFT',
    name: '🍿 Entertainment',
    goalType: 'NEED',
    goalCadence: 2,
    goalDay: 6,
    goalCadenceFrequency: 1,
    goalNeedsWholeAmount: true,
  },
  {
    key: 'vacation',
    masterKey: 'wants',
    internalName: null,
    sortableIndex: 190000,
    type: 'DFT',
    name: '🏝️ Vacation',
    goalType: 'TB',
  },
  {
    key: 'forgot',
    masterKey: 'wants',
    internalName: null,
    sortableIndex: 200000,
    type: 'DFT',
    name: '❗️ Stuff I forgot to plan for',
  },
  {
    key: 'subscription',
    masterKey: 'wants',
    internalName: null,
    sortableIndex: 210000,
    type: 'DFT',
    name: '🌳 YNAB subscription',
    goalType: 'NEED',
    goalCadence: 13,
    goalCadenceFrequency: 1,
    goalNeedsWholeAmount: true,
    subscriptionTarget: true,
  },
];

const systemPayees = [
  ['balance-adjustment', 'BalanceAdjustmentPayee', 'Manual Balance Adjustment'],
  [
    'reconciliation-adjustment',
    'BalanceAdjustmentReconcilePayee',
    'Reconciliation Balance Adjustment',
  ],
  ['starting-balance', 'StartingBalancePayee', 'Starting Balance'],
] as const;

export function buildStockPlanBootstrap(
  input: StockPlanBootstrapInput,
): readonly PlanEntity[] {
  const masterIds = new Map(
    masters.map(master => [
      master.key,
      input.allocateId(`master:${master.key}`),
    ]),
  );
  const categoryIds = new Map(
    categories.map(category => [
      category.key,
      input.allocateId(`category:${category.key}`),
    ]),
  );
  const subscriptionTargetDate = addMonthsAndDays(input.createdOn, 13, 3);
  const currentMonth = firstOfMonth(input.createdOn);
  const nextMonth = addMonthsAndDays(currentMonth, 1, 0);

  const entities: PlanEntity[] = [
    entity('be_budget', input.budgetVersionId, {
      budgetVersionId: input.budgetVersionId,
      budgetId: input.planId,
      budgetName: input.name,
      deviceKnowledge: 0,
      dateFormat: input.dateFormat,
      currencyFormat: input.currencyFormat,
      source: null,
    }),
  ];

  for (const master of masters) {
    entities.push(
      entity('be_master_categories', requireMapValue(masterIds, master.key), {
        budgetVersionId: input.budgetVersionId,
        internalName: master.internalName,
        deletable: master.deletable,
        sortableIndex: master.sortableIndex,
        name: master.name,
        note: null,
        isHidden: false,
        deviceKnowledge: 0,
      }),
    );
  }

  for (const category of categories) {
    entities.push(
      entity('be_subcategories', requireMapValue(categoryIds, category.key), {
        budgetVersionId: input.budgetVersionId,
        masterCategoryId: requireMapValue(masterIds, category.masterKey),
        accountId: null,
        internalName: category.internalName,
        sortableIndex: category.sortableIndex,
        pinnedIndex: null,
        type: category.type,
        name: category.name,
        note: null,
        isHidden: false,
        goalType: category.goalType ?? null,
        goalCreatedOn: null,
        goalTargetAmount: 0,
        goalTargetDate: category.subscriptionTarget
          ? subscriptionTargetDate
          : null,
        monthlyFunding: 0,
        deviceKnowledge: 0,
        goalCadence: category.goalCadence ?? null,
        goalDay: category.goalDay ?? null,
        goalCadenceFrequency: category.goalCadenceFrequency ?? null,
        goalNeedsWholeAmount: category.goalNeedsWholeAmount ?? null,
        pinnedGoalIndex: null,
      }),
    );
  }

  for (const [key, internalName, name] of systemPayees) {
    entities.push(
      entity('be_payees', input.allocateId(`payee:${key}`), {
        budgetVersionId: input.budgetVersionId,
        internalName,
        accountId: null,
        enabled: false,
        autoFillSubCategoryId: null,
        autoFillMemo: null,
        autoFillAmount: 0,
        name,
        deviceKnowledge: 0,
        autoFillSubCategoryEnabled: false,
        autoFillAmountEnabled: false,
        autoFillMemoEnabled: false,
      }),
    );
  }

  entities.push(
    entity(
      'be_settings',
      `${input.budgetVersionId}/onboarding_task_list_type`,
      {
        budgetVersionId: input.budgetVersionId,
        settingName: 'onboarding_task_list_type',
        settingValue: 'ftue_mirror',
        deviceKnowledge: 0,
      },
    ),
  );

  for (const eventName of ['created_after_onboarding', 'completed_ftue']) {
    entities.push(
      entity(
        'be_onboarding_events',
        input.allocateId(`onboarding:${eventName}`),
        {
          budgetVersionId: input.budgetVersionId,
          eventName,
          userId: input.principalId,
          createdAt: input.createdAtMilliseconds,
          updatedAt: input.createdAtMilliseconds,
          deviceKnowledge: 0,
        },
      ),
    );
  }

  for (const month of [currentMonth, nextMonth]) {
    const monthKey = month.slice(0, 7);
    const monthlyBudgetId = `mb/${monthKey}/${input.budgetVersionId}`;
    entities.push(
      entity('be_monthly_budgets', monthlyBudgetId, {
        budgetVersionId: input.budgetVersionId,
        month,
        note: null,
        deviceKnowledge: 0,
      }),
    );
    for (const category of categories.filter(value => value.key !== 'split')) {
      const categoryId = requireMapValue(categoryIds, category.key);
      entities.push(
        entity(
          'be_monthly_subcategory_budgets',
          `mcb/${monthKey}/${categoryId}`,
          {
            budgetVersionId: input.budgetVersionId,
            monthlyBudgetId,
            month,
            subCategoryId: categoryId,
            budgeted: 0,
            overspendingHandling: null,
            note: null,
            deviceKnowledge: 0,
          },
        ),
      );
    }
  }

  return entities;
}

function entity(
  entityKind: string,
  entityId: string,
  payload: Readonly<Record<string, unknown>>,
): PlanEntity {
  return { entityKind, entityId, isTombstone: false, payload };
}

function requireMapValue(
  values: ReadonlyMap<string, string>,
  key: string,
): string {
  const value = values.get(key);
  if (!value) {
    throw new Error(`Missing bootstrap identity for ${key}`);
  }
  return value;
}

function firstOfMonth(date: string): string {
  const parsed = parseDate(date);
  return formatDate(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)));
}

function addMonthsAndDays(date: string, months: number, days: number): string {
  const parsed = parseDate(date);
  return formatDate(
    new Date(
      Date.UTC(parsed.year, parsed.month - 1 + months, parsed.day + days),
    ),
  );
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) {
    throw new Error('createdOn must be an ISO calendar date');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('createdOn must be a valid ISO calendar date');
  }
  return { year, month, day };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
