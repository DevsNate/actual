import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import type { AccountCreationService } from './account-creation-service';
import { createStockAccountGateway } from './stock-account-gateway';

const principal: AuthenticatedPrincipal = {
  id: 'principal-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

describe('stock account gateway', () => {
  test('accepts the captured Token-authenticated direct-import request and returns the exact acknowledgement', async () => {
    const service: AccountCreationService = {
      createUnlinkedAccount: vi.fn().mockResolvedValue({
        replayed: false,
        serverKnowledge: 4,
        endingDeviceKnowledge: 0,
        response: {
          accountId: 'account-3',
          name: 'Account Capture 3',
          type: 'checking',
          openingBalance: 345670,
          budgetId: 'canonical-budget-1',
        },
      }),
    };
    const app = createApp(service);

    await request(app)
      .post('/api/direct_import/budgets/version-1/accounts')
      .set('authorization', 'Token token=actual-session')
      .set('x-ynab-api-version', '2026-01-01')
      .send(capturedBody())
      .expect(201, {
        id: 'account-3',
        account_name: 'Account Capture 3',
        account_type: 'Checking',
        balance_millicents: 345670,
        budget_id: 'version-1',
      });
    expect(service.createUnlinkedAccount).toHaveBeenCalledWith({
      principalId: 'principal-1',
      budgetId: 'canonical-budget-1',
      originDeviceId: 'stock-web-direct-import',
      idempotencyKey: 'stock-account-create:request-1',
      name: 'Account Capture 3',
      accountType: 'checking',
      openingBalance: 345670,
      openingDate: '2026-08-17',
    });
  });

  test('fails closed for missing auth, unsupported versions, and malformed account shapes', async () => {
    const service: AccountCreationService = {
      createUnlinkedAccount: vi.fn(),
    };
    const app = createApp(service);
    await request(app)
      .post('/api/direct_import/budgets/plan-1/accounts')
      .set('x-ynab-api-version', '2026-01-01')
      .send(capturedBody())
      .expect(401, { error: { id: 'invalid-session' } });
    await request(app)
      .post('/api/direct_import/budgets/plan-1/accounts')
      .set('authorization', 'Token token=actual-session')
      .set('x-ynab-api-version', 'unknown')
      .send(capturedBody())
      .expect(400, { error: { id: 'unsupported_api_version' } });
    await request(app)
      .post('/api/direct_import/budgets/plan-1/accounts')
      .set('authorization', 'Token token=actual-session')
      .set('x-ynab-api-version', '2026-01-01')
      .send({ ...capturedBody(), type: 'Liability' })
      .expect(400, { error: { id: 'invalid_account_request' } });
    expect(service.createUnlinkedAccount).not.toHaveBeenCalled();
  });
});

function createApp(service: AccountCreationService): express.Express {
  const app = express();
  app.use(
    '/api',
    createStockAccountGateway({
      accountCreationService: service,
      budgetReader: {
        readBudget: vi.fn(),
        readBudgetByVersion: vi.fn().mockResolvedValue({
          budgetId: 'canonical-budget-1',
          budgetVersionId: 'version-1',
          name: 'Plan',
          serverKnowledge: 1,
          currencyFormat: {},
          dateFormat: {},
          entities: [],
        }),
      },
      resolvePrincipal: token => {
        expect(token).toBe('actual-session');
        return principal;
      },
      allocateRequestId: () => 'request-1',
    }),
  );
  return app;
}

test('accepts the captured CreditCard creation shape through the same canonical account boundary', async () => {
  const service: AccountCreationService = {
    createUnlinkedAccount: vi.fn().mockResolvedValue({
      replayed: false,
      serverKnowledge: 72,
      endingDeviceKnowledge: 0,
      response: {
        accountId: 'credit-account-1',
        name: 'CC Capture 3',
        type: 'credit-card',
        openingBalance: -432100,
        budgetId: 'canonical-budget-1',
      },
    }),
  };
  const app = createApp(service);

  await request(app)
    .post('/api/direct_import/budgets/version-1/accounts')
    .set('authorization', 'Token token=actual-session')
    .set('x-ynab-api-version', '2026-01-01')
    .send({
      ...capturedBody(),
      name: 'CC Capture 3',
      type: 'CreditCard',
      balance: -432100,
      starting_balance_date: '2026-08-21',
      debt_interest_rates: '{"2026-08-01":0}',
      debt_minimum_payments: '{"2026-08-01":0}',
    })
    .expect(201, {
      id: 'credit-account-1',
      account_name: 'CC Capture 3',
      account_type: 'CreditCard',
      balance_millicents: -432100,
      budget_id: 'version-1',
    });
  expect(service.createUnlinkedAccount).toHaveBeenCalledWith(
    expect.objectContaining({
      accountType: 'credit-card',
      openingBalance: -432100,
    }),
  );
});

function capturedBody() {
  return {
    name: 'Account Capture 3',
    type: 'Checking',
    balance: 345670,
    starting_balance_date: '2026-08-17',
    debt_interest_rates: '{"2026-08-01":0}',
    debt_minimum_payments: '{"2026-08-01":0}',
    debt_escrow_amounts: null,
    paired_sub_category: null,
    is_migrating_to_debt_account: false,
  };
}
