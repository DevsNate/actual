import type {
  AuthenticatedPrincipal,
  BudgetVersionPlanReader,
  CatalogReader,
} from '@actual-app/semantic-core';
import { buildStockPlanBootstrap } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import type { StockBudgetChangeWriter } from './stock-budget-operation';
import { projectStockEntity } from './stock-budget-projection';
import { createStockCatalogGateway } from './stock-catalog-gateway';

const principal: AuthenticatedPrincipal = {
  id: 'user-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

function createSnapshot() {
  let sequence = 0;
  return {
    planId: 'plan-1',
    budgetVersionId: 'version-1',
    name: 'Plan',
    serverKnowledge: 29,
    currencyFormat: {},
    dateFormat: {},
    entities: buildStockPlanBootstrap({
      planId: 'plan-1',
      budgetVersionId: 'version-1',
      principalId: 'user-1',
      name: 'Plan',
      currencyFormat: {},
      dateFormat: {},
      createdOn: '2026-08-17',
      createdAtMilliseconds: Date.UTC(2026, 7, 17),
      allocateId: label => `${label}:${sequence++}`,
    }),
  };
}

function application(
  planReader: BudgetVersionPlanReader,
  changeWriter: StockBudgetChangeWriter = { commitChangeSet: vi.fn() },
) {
  const result = express();
  const catalogReader: CatalogReader = { readCatalog: vi.fn() };
  result.use(
    '/api/v1',
    createStockCatalogGateway({
      catalogReader,
      planReader,
      changeWriter,
      resolvePrincipal: () => principal,
    }),
  );
  return result;
}

function budgetRequest(syncType: string, overrides = {}) {
  return {
    operation_name: 'syncBudgetData',
    request_data: JSON.stringify({
      budget_version_id: 'version-1',
      sync_type: syncType,
      calculated_entities_included: false,
      schema_version: 44,
      schema_version_of_knowledge: 44,
      starting_device_knowledge: 0,
      ending_device_knowledge: 0,
      device_knowledge_of_server: 0,
      changed_entities: {},
      ...overrides,
    }),
  };
}

function stockRequest(
  planReader: BudgetVersionPlanReader,
  syncType: string,
  overrides = {},
  changeWriter?: StockBudgetChangeWriter,
) {
  return request(application(planReader, changeWriter))
    .post('/api/v1/catalog')
    .set('x-session-token', 'session')
    .set('x-ynab-api-version', '2026-01-01')
    .set('x-ynab-client-request-id', 'request-1')
    .set('x-ynab-device-id', 'device-1')
    .type('form')
    .send(budgetRequest(syncType, overrides));
}

describe('stock budget gateway', () => {
  test('returns the exact fresh-plan bootstrap table surface', async () => {
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(createSnapshot()),
    };

    const response = await stockRequest(planReader, 'bootstrap').expect(200);
    expect(response.headers['x-ynab-client-request-id']).toBe('request-1');
    expect(response.body).toMatchObject({
      error: null,
      schema_version_of_response: 44,
      schema_version_of_server: 44,
      server_knowledge_of_device: 0,
      current_server_knowledge: 29,
      changed_entities: {
        first_month: '2026-08-01',
        last_month: '2026-08-01',
        be_budget: { id: 'version-1', budget_name: 'Plan' },
      },
    });
    expect(Object.keys(response.body.changed_entities).sort()).toEqual([
      'be_account_calculations',
      'be_account_mappings',
      'be_accounts',
      'be_budget',
      'be_expected_income',
      'be_master_categories',
      'be_monthly_account_calculations',
      'be_monthly_budget_calculations',
      'be_monthly_budgets',
      'be_monthly_subcategory_budget_calculations',
      'be_monthly_subcategory_budgets',
      'be_onboarding_events',
      'be_onboarding_targets',
      'be_payee_rename_conditions',
      'be_payees',
      'be_scheduled_subtransactions',
      'be_scheduled_transactions',
      'be_settings',
      'be_subcategories',
      'be_subtransactions',
      'be_transaction_images',
      'be_transactions',
      'first_month',
      'last_month',
    ]);
    expect(
      response.body.changed_entities.be_monthly_budget_calculations,
    ).toHaveLength(2);
    expect(
      response.body.changed_entities.be_monthly_subcategory_budget_calculations,
    ).toHaveLength(28);
    expect(planReader.readPlanByBudgetVersion).toHaveBeenCalledWith(
      'user-1',
      'version-1',
    );
  });

  test('returns the admitted empty backfill surface', async () => {
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(createSnapshot()),
    };

    const response = await stockRequest(planReader, 'backfill').expect(200);
    expect(response.body.changed_entities).toMatchObject({
      first_month: '2026-08-01',
      last_month: '2026-08-01',
      be_money_movements: [],
      be_monthly_budgets: [],
      be_transactions: [],
    });
    expect(Object.keys(response.body.changed_entities)).toHaveLength(13);
  });

  test('fails closed for writes, deltas, and unauthorized versions', async () => {
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(null),
    };
    await stockRequest(planReader, 'bootstrap').expect(403, {
      error: { id: 'user_does_not_have_read_permissions' },
    });
    const liveReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(createSnapshot()),
    };
    await stockRequest(liveReader, 'bootstrap', {
      changed_entities: { be_transactions: [{}] },
    }).expect(400, { error: { id: 'invalid_budget_request' } });
    await stockRequest(liveReader, 'unknown').expect(501, {
      error: { id: 'unsupported_budget_sync_type' },
    });
  });

  test('commits the admitted opened-budget delta atomically', async () => {
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(createSnapshot()),
    };
    const changeWriter: StockBudgetChangeWriter = {
      commitChangeSet: vi.fn().mockImplementation(input =>
        Promise.resolve({
          replayed: false,
          serverKnowledge: 30,
          endingDeviceKnowledge: 2,
          response: input.response,
        }),
      ),
    };
    const timestamp = '2026-08-17T01:02:03.456Z';

    const response = await stockRequest(
      planReader,
      'delta',
      {
        starting_device_knowledge: 0,
        ending_device_knowledge: 2,
        device_knowledge_of_server: 29,
        changed_entities: {
          be_monthly_budgets: [
            {
              id: 'mb/2026-07/version-1',
              is_tombstone: false,
              month: '2026-07-01',
              note: '',
            },
          ],
          be_onboarding_events: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              is_tombstone: false,
              event_name: 'opened_budget',
              user_id: 'user-1',
              created_at: timestamp,
              updated_at: timestamp,
            },
          ],
        },
      },
      changeWriter,
    ).expect(200);

    expect(response.body).toMatchObject({
      current_server_knowledge: 30,
      server_knowledge_of_device: 2,
      changed_entities: {
        be_budget: null,
        be_expected_income: null,
        first_month: '2026-08-01',
        last_month: '2026-08-01',
      },
    });
    expect(changeWriter.commitChangeSet).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSetId: 'stock-budget:plan-1:request-1',
        planId: 'plan-1',
        originDeviceId: 'device-1',
        startingDeviceKnowledge: 0,
        endingDeviceKnowledge: 2,
        expectedServerKnowledge: 29,
        schemaVersion: 44,
        idempotencyKey: 'request-1',
        payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
        changes: [
          expect.objectContaining({
            entityKind: 'be_monthly_budgets',
            entityId: 'mb/2026-07/version-1',
          }),
          expect.objectContaining({
            entityKind: 'be_onboarding_events',
            entityId: '11111111-1111-4111-8111-111111111111',
          }),
        ],
      }),
    );
  });

  test('acknowledges an empty current delta without another write', async () => {
    const snapshot = { ...createSnapshot(), serverKnowledge: 30 };
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(snapshot),
    };
    const changeWriter: StockBudgetChangeWriter = {
      commitChangeSet: vi.fn(),
    };

    await stockRequest(
      planReader,
      'delta',
      {
        starting_device_knowledge: 2,
        ending_device_knowledge: 2,
        device_knowledge_of_server: 30,
      },
      changeWriter,
    ).expect(200);
    expect(changeWriter.commitChangeSet).not.toHaveBeenCalled();
  });

  test('commits the captured account and bound transfer-payee rename', async () => {
    const baseSnapshot = createSnapshot();
    const account = {
      entityKind: 'be_accounts' as const,
      entityId: 'account-3',
      isTombstone: false,
      payload: {
        budgetVersionId: 'version-1',
        creationCommandKey: 'create-3',
        accountName: 'Account Capture 3',
        accountType: 'Checking',
        note: null,
        lastPaymentPayeeId: null,
        isClosed: false,
        sortableIndex: 2,
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
    };
    const payee = {
      entityKind: 'be_payees' as const,
      entityId: 'payee-3',
      isTombstone: false,
      payload: {
        budgetVersionId: 'version-1',
        accountId: 'account-3',
        enabled: true,
        autoFillSubCategoryId: null,
        autoFillUserDefinedSubCategoryId: null,
        autoFillMemo: null,
        autoFillAmount: 0,
        autoFillSubCategoryEnabled: true,
        autoFillMemoEnabled: false,
        autoFillAmountEnabled: false,
        renameOnImportEnabled: true,
        name: 'Transfer : Account Capture 3',
        internalName: null,
      },
    };
    const snapshot = {
      ...baseSnapshot,
      serverKnowledge: 36,
      entities: [...baseSnapshot.entities, account, payee],
    };
    const planReader: BudgetVersionPlanReader = {
      readPlanByBudgetVersion: vi.fn().mockResolvedValue(snapshot),
    };
    const changeWriter: StockBudgetChangeWriter = {
      commitChangeSet: vi.fn().mockImplementation(input =>
        Promise.resolve({
          replayed: false,
          serverKnowledge: 37,
          endingDeviceKnowledge: 2,
          response: input.response,
        }),
      ),
    };

    const response = await stockRequest(
      planReader,
      'delta',
      {
        starting_device_knowledge: 0,
        ending_device_knowledge: 2,
        device_knowledge_of_server: 36,
        changed_entities: {
          be_accounts: [
            {
              ...projectStockEntity(account),
              account_name: 'Account Renamed 3',
            },
          ],
          be_payees: [
            {
              ...projectStockEntity(payee),
              name: 'Transfer : Account Renamed 3',
            },
          ],
        },
      },
      changeWriter,
    ).expect(200);

    expect(response.body).toMatchObject({
      current_server_knowledge: 37,
      server_knowledge_of_device: 2,
    });
    expect(changeWriter.commitChangeSet).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          expect.objectContaining({
            entityKind: 'be_accounts',
            entityId: 'account-3',
            payload: expect.objectContaining({
              accountName: 'Account Renamed 3',
            }),
          }),
          expect.objectContaining({
            entityKind: 'be_payees',
            entityId: 'payee-3',
            payload: expect.objectContaining({
              name: 'Transfer : Account Renamed 3',
            }),
          }),
        ],
      }),
    );
  });
});
