import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import type { BudgetCreationService } from './budget-creation-service';
import { createStockBudgetGateway } from './stock-budget-lifecycle-gateway';

const principal: AuthenticatedPrincipal = {
  id: 'principal-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

describe('stock budget lifecycle gateway', () => {
  test('accepts the captured create-budget envelope and returns the stock client acknowledgement', async () => {
    const service: BudgetCreationService = {
      createBudget: vi.fn().mockResolvedValue({
        replayed: false,
        catalogServerKnowledge: 8,
        budgetServerKnowledge: 1,
        budget: {
          budgetId: 'plan-1',
          budgetVersionId: 'version-1',
        },
      }),
    };
    const app = createApp(service);

    const response = await request(app)
      .post('/api/budgets')
      .set('authorization', 'Token actual-session')
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-device-id', 'stock-web-device')
      .set('x-ynab-client-request-id', 'stock-plan-request-1')
      .send(capturedBody())
      .expect(201, { id: 'version-1' });

    expect(response.headers['x-ynab-client-request-id']).toBe(
      'stock-plan-request-1',
    );
    expect(service.createBudget).toHaveBeenCalledWith({
      principalId: 'principal-1',
      originDeviceId: 'stock-web-device',
      idempotencyKey: 'stock-plan-request-1',
      name: 'Plan Create Trace',
      currencyFormat: JSON.parse(capturedBody().budget.currency_format),
      dateFormat: JSON.parse(capturedBody().budget.date_format),
    });
  });

  test('returns the original acknowledgement for an idempotent replay', async () => {
    const service: BudgetCreationService = {
      createBudget: vi.fn().mockResolvedValue({
        replayed: true,
        catalogServerKnowledge: 8,
        budgetServerKnowledge: 1,
        budget: {
          budgetId: 'plan-1',
          budgetVersionId: 'version-1',
        },
      }),
    };

    await stockRequest(createApp(service)).expect(200, { id: 'version-1' });
  });

  test('fails closed for missing auth, request identity, unsupported versions, and malformed bodies', async () => {
    const service: BudgetCreationService = { createBudget: vi.fn() };
    const app = createApp(service);
    await request(app)
      .post('/api/budgets')
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-device-id', 'stock-web-device')
      .set('x-ynab-client-request-id', 'stock-plan-request-1')
      .send(capturedBody())
      .expect(401, { error: { id: 'invalid-session' } });
    await request(app)
      .post('/api/budgets')
      .set('authorization', 'Token actual-session')
      .set('x-ynab-api-version', 'unknown')
      .set('x-ynab-device-id', 'stock-web-device')
      .set('x-ynab-client-request-id', 'stock-plan-request-1')
      .send(capturedBody())
      .expect(400, { error: { id: 'unsupported_api_version' } });
    await request(app)
      .post('/api/budgets')
      .set('authorization', 'Token actual-session')
      .set('x-ynab-api-version', '2026-01-01')
      .set('x-ynab-device-id', 'stock-web-device')
      .send(capturedBody())
      .expect(400, { error: { id: 'invalid_budget_request' } });
    await stockRequest(app, { budget: { name: 'Incomplete' } }).expect(400, {
      error: { id: 'invalid_budget_request' },
    });
    expect(service.createBudget).not.toHaveBeenCalled();
  });
});

function createApp(service: BudgetCreationService): express.Express {
  const app = express();
  app.use(
    '/api',
    createStockBudgetGateway({
      budgetCreationService: service,
      resolvePrincipal: token => {
        expect(token).toBe('actual-session');
        return principal;
      },
    }),
  );
  return app;
}

function stockRequest(
  app: express.Express,
  body: string | object = capturedBody(),
) {
  return request(app)
    .post('/api/budgets')
    .set('authorization', 'Token actual-session')
    .set('x-ynab-api-version', '2026-01-01')
    .set('x-ynab-device-id', 'stock-web-device')
    .set('x-ynab-client-request-id', 'stock-plan-request-1')
    .send(body);
}

function capturedBody() {
  return {
    budget: {
      name: 'Plan Create Trace',
      currency_format: JSON.stringify({
        iso_code: 'USD',
        example_format: '123,456.78',
        decimal_digits: 2,
        decimal_separator: '.',
        symbol_first: true,
        group_separator: ',',
        currency_symbol: '$',
        display_symbol: true,
      }),
      date_format: JSON.stringify({ format: 'MM/DD/YYYY' }),
    },
  };
}
