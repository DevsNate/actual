import type { BudgetEntity, BudgetSnapshot } from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

import {
  handleStockBudgetSync,
  type StockBudgetChangeWriter,
} from './stock-budget-operation';
import {
  parseStockCategoryAssignment,
  parseStockCategoryAssignmentReplay,
} from './stock-category-assignment';

function snapshot(): BudgetSnapshot {
  let sequence = 0;
  const entities: BudgetEntity[] = [
    ...buildStockBudgetBootstrap({
      budgetId: 'budget-1',
      budgetVersionId: 'version-1',
      principalId: 'user-1',
      name: 'Budget',
      currencyFormat: {},
      dateFormat: {},
      createdOn: '2026-08-16',
      createdAtMilliseconds: Date.UTC(2026, 7, 16),
      allocateId: label => `${label}:${sequence++}`,
    }),
  ];
  const result: BudgetSnapshot = {
    budgetId: 'budget-1',
    budgetVersionId: 'version-1',
    name: 'Budget',
    serverKnowledge: 45,
    currencyFormat: {},
    dateFormat: {},
    entities,
  };
  const startingPayee = result.entities.find(
    entity => entity.payload.internalName === 'StartingBalancePayee',
  )!;
  const immediateIncome = result.entities.find(
    entity => entity.payload.internalName === 'Category/__ImmediateIncome__',
  )!;
  entities.push(
    {
      entityKind: 'be_accounts',
      entityId: 'account-1',
      isTombstone: false,
      payload: {
        accountName: 'Checking',
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
        name: 'Transfer : Checking',
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
        date: '2026-08-16',
        amount: 1000000,
        cashAmount: 1000000,
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
  return result;
}

function requestRows(
  current: BudgetSnapshot,
  budgeted = 1000,
  movementId = 'movement-1',
) {
  const monthly = current.entities.find(
    entity =>
      entity.entityKind === 'be_monthly_subcategory_budgets' &&
      entity.payload.month === '2026-08-01' &&
      current.entities.find(
        value =>
          value.entityKind === 'be_subcategories' &&
          value.entityId === entity.payload.subCategoryId,
      )?.payload.internalName === null,
  )!;
  return {
    monthly,
    changedEntities: {
      be_monthly_subcategory_budgets: [
        {
          id: monthly.entityId,
          is_tombstone: false,
          entities_monthly_budget_id: monthly.payload.monthlyBudgetId,
          entities_subcategory_id: monthly.payload.subCategoryId,
          budgeted,
          goal_snoozed_at: null,
        },
      ],
      be_money_movements: [
        {
          id: movementId,
          is_tombstone: false,
          to_entities_monthly_subcategory_budget_id: monthly.entityId,
          from_entities_monthly_subcategory_budget_id: null,
          entities_money_movement_group_id: null,
          amount: 1000,
          performed_by_user_id: 'user-1',
          note: null,
          source: 'manual_assign',
          move_started_at: '2026-08-21T04:20:26.294Z',
          move_accepted_at: null,
        },
      ],
    },
  };
}

function applyAssignment(
  current: BudgetSnapshot,
  parsed: NonNullable<ReturnType<typeof parseStockCategoryAssignment>>,
  serverKnowledge: number,
): BudgetSnapshot {
  const entities = current.entities.map(entity =>
    entity.entityId === parsed.changes[0].entityId ? parsed.changes[0] : entity,
  );
  entities.push(parsed.changes[1] as BudgetEntity);
  return { ...current, serverKnowledge, entities };
}

test('parses the exact ASSIGNMENT-001 request and calculation projection', () => {
  const current = snapshot();
  const request = requestRows(current);
  const parsed = parseStockCategoryAssignment(
    request.changedEntities,
    current,
    'user-1',
    '2026-08-21T04:20:26.387756',
  );
  expect(parsed).toMatchObject({
    assignment: {
      kind: 'assign',
      expectedBudgeted: 0,
      budgeted: 1000,
      movement: {
        amount: 1000,
        startedAt: '2026-08-21T04:20:26.294',
        acceptedAt: '2026-08-21T04:20:26.387756',
      },
    },
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: 2,
  });
  expect(parsed?.changedEntities.be_money_movements).toEqual([
    expect.objectContaining({
      id: 'movement-1',
      to_entities_monthly_subcategory_budget_id: request.monthly.entityId,
      move_accepted_at: '2026-08-21T04:20:26.387756',
    }),
  ]);
  expect(parsed?.changedEntities.be_monthly_budget_calculations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ budgeted: 1000, available_to_budget: 999000 }),
      expect.objectContaining({ balance: 1000, available_to_budget: 999000 }),
    ]),
  );
});

test('admits only the captured same-request replay state', () => {
  const initial = snapshot();
  const firstRequest = requestRows(initial);
  const first = parseStockCategoryAssignment(
    firstRequest.changedEntities,
    initial,
    'user-1',
    '2026-08-21T04:20:26.387756',
  )!;
  const afterFirst = applyAssignment(initial, first, 47);
  const request = requestRows(afterFirst, 2000, 'movement-2');
  const second = parseStockCategoryAssignment(
    request.changedEntities,
    afterFirst,
    'user-1',
    '2026-08-21T04:21:26.387756',
  );
  const afterSecond = applyAssignment(afterFirst, second!, 49);
  const replay = parseStockCategoryAssignmentReplay(
    request.changedEntities,
    afterSecond,
    'user-1',
  );
  expect(replay).toMatchObject({
    assignment: {
      kind: 'captured-replay',
      expectedBudgeted: 2000,
      budgeted: 2000,
    },
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: 1,
  });
  expect(
    parseStockCategoryAssignmentReplay(
      {
        ...request.changedEntities,
        be_money_movements: [
          {
            ...(request.changedEntities.be_money_movements as object[])[0],
            amount: 2000,
          },
        ],
      },
      afterSecond,
      'user-1',
    ),
  ).toBeNull();
});

test('routes the captured assignment and exact replay through the atomic writer', async () => {
  const initial = snapshot();
  const firstRequest = requestRows(initial);
  const first = parseStockCategoryAssignment(
    firstRequest.changedEntities,
    initial,
    'user-1',
    '2026-08-21T04:20:26.387756',
  )!;
  const afterFirst = applyAssignment(initial, first, 47);
  const request = requestRows(afterFirst, 2000, 'movement-2');
  const commitCategoryAssignment = vi.fn(async command => ({
    replayed: false,
    serverKnowledge:
      command.delivery.expectedServerKnowledge +
      command.delivery.serverKnowledgeAdvance,
    endingDeviceKnowledge: command.delivery.endingDeviceKnowledge,
    response: command.delivery.response,
  }));
  const writer: StockBudgetChangeWriter = {
    commitChangeSet: vi.fn(),
    acknowledgeDevice: vi.fn(),
    commitAccountRename: vi.fn(),
    commitPristineAccountDeletion: vi.fn(),
    commitAccountClose: vi.fn(),
    commitAccountReopen: vi.fn(),
    commitCategoryMutation: vi.fn(),
    commitCategoryAssignment,
    commitOrdinaryTransactionMutation: vi.fn(),
    commitOrdinaryPayeeMutation: vi.fn(),
  };
  const context = {
    principal: {
      id: 'user-1',
      loginName: 'person@example.com',
      displayName: 'Person',
      role: 'BASIC' as const,
    },
    sessionToken: 'session',
    clientRequestId: 'assignment-request-1',
    deviceId: 'device-1',
    requestData: JSON.stringify({
      budget_version_id: 'version-1',
      sync_type: 'delta',
      calculated_entities_included: false,
      schema_version: 44,
      schema_version_of_knowledge: 44,
      starting_device_knowledge: 0,
      ending_device_knowledge: 2,
      device_knowledge_of_server: 47,
      changed_entities: request.changedEntities,
    }),
  };
  const normal = await handleStockBudgetSync(context, {
    budgetReader: {
      readBudgetByVersion: vi.fn().mockResolvedValue(afterFirst),
    },
    changeWriter: writer,
  });
  expect(normal).toMatchObject({
    status: 200,
    body: { current_server_knowledge: 49, server_knowledge_of_device: 2 },
  });

  const second = parseStockCategoryAssignment(
    request.changedEntities,
    afterFirst,
    'user-1',
    '2026-08-21T04:20:26.387756',
  )!;
  const afterSecond = applyAssignment(afterFirst, second, 49);
  const replay = await handleStockBudgetSync(context, {
    budgetReader: {
      readBudgetByVersion: vi.fn().mockResolvedValue(afterSecond),
    },
    changeWriter: writer,
  });
  expect(replay).toMatchObject({
    status: 200,
    body: { current_server_knowledge: 50, server_knowledge_of_device: 2 },
  });
  expect(commitCategoryAssignment).toHaveBeenCalledTimes(2);
  expect(commitCategoryAssignment.mock.calls[1][0]).toMatchObject({
    assignment: { kind: 'captured-replay' },
    delivery: {
      startingDeviceKnowledge: 2,
      endingDeviceKnowledge: 2,
      expectedServerKnowledge: 49,
      serverKnowledgeAdvance: 1,
    },
  });
});
