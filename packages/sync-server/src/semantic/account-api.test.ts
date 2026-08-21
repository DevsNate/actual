import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import { createSemanticAccountHandlers } from './account-api';
import type { AccountCreationService } from './account-creation-service';

const principal: AuthenticatedPrincipal = {
  id: 'principal-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

describe('semantic account API', () => {
  test('accepts only the admitted unlinked Checking endpoint shape', async () => {
    const accountCreationService: AccountCreationService = {
      createUnlinkedAccount: vi.fn().mockResolvedValue({
        replayed: false,
        serverKnowledge: 3,
        endingDeviceKnowledge: 0,
        response: {
          accountId: 'account-1',
          name: 'Account Capture 1',
          type: 'checking',
          openingBalance: 123450,
          budgetId: 'plan-1',
        },
      }),
    };
    const app = createApp(accountCreationService);
    await request(app)
      .post('/semantic/v1/budgets/plan-1/accounts')
      .set('x-actual-token', 'actual-session')
      .set('x-semantic-device-id', 'web-device-1')
      .set('idempotency-key', 'account-request-1')
      .send({
        name: 'Account Capture 1',
        type: 'checking',
        openingBalance: 123450,
        openingDate: '2026-08-17',
      })
      .expect(201, {
        status: 'ok',
        data: {
          account: {
            accountId: 'account-1',
            name: 'Account Capture 1',
            type: 'checking',
            openingBalance: 123450,
            budgetId: 'plan-1',
          },
          budget_server_knowledge: 3,
          replayed: false,
        },
      });
    expect(accountCreationService.createUnlinkedAccount).toHaveBeenCalledWith({
      principalId: 'principal-1',
      budgetId: 'plan-1',
      originDeviceId: 'web-device-1',
      idempotencyKey: 'account-request-1',
      accountType: 'checking',
      name: 'Account Capture 1',
      openingBalance: 123450,
      openingDate: '2026-08-17',
    });
  });

  test('rejects linked, non-Checking, or malformed defaults', async () => {
    const accountCreationService: AccountCreationService = {
      createUnlinkedAccount: vi.fn(),
    };
    const app = createApp(accountCreationService);
    await request(app)
      .post('/semantic/v1/budgets/plan-1/accounts')
      .set('x-actual-token', 'actual-session')
      .set('x-semantic-device-id', 'web-device-1')
      .set('idempotency-key', 'account-request-1')
      .send({
        name: 'Unsupported',
        type: 'credit-card',
        openingBalance: 0,
        openingDate: '2026-08-17',
      })
      .expect(400, {
        status: 'error',
        reason: 'invalid-account-creation-request',
      });
    expect(accountCreationService.createUnlinkedAccount).not.toHaveBeenCalled();
  });
});

function createApp(service: AccountCreationService): express.Express {
  const app = express();
  app.use(
    '/semantic/v1',
    createSemanticAccountHandlers({
      accountCreationService: service,
      resolvePrincipal: () => principal,
    }),
  );
  return app;
}
