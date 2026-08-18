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
      createCheckingAccount: vi.fn().mockResolvedValue({
        replayed: false,
        serverKnowledge: 3,
        endingDeviceKnowledge: 0,
        response: {
          id: 'account-1',
          account_name: 'Account Capture 1',
          account_type: 'Checking',
          balance_millicents: 123450,
          budget_id: 'plan-1',
        },
      }),
    };
    const app = createApp(accountCreationService);
    await request(app)
      .post('/semantic/v1/plans/plan-1/accounts')
      .set('x-actual-token', 'actual-session')
      .set('x-semantic-device-id', 'web-device-1')
      .set('idempotency-key', 'account-request-1')
      .send({
        name: 'Account Capture 1',
        type: 'Checking',
        balance: 123450,
        starting_balance_date: '2026-08-17',
        debt_interest_rates: '{"2026-08-01":0}',
        debt_minimum_payments: '{"2026-08-01":0}',
        debt_escrow_amounts: null,
        paired_sub_category: null,
        is_migrating_to_debt_account: false,
      })
      .expect(201, {
        status: 'ok',
        data: {
          id: 'account-1',
          account_name: 'Account Capture 1',
          account_type: 'Checking',
          balance_millicents: 123450,
          budget_id: 'plan-1',
          budget_server_knowledge: 3,
          replayed: false,
        },
      });
    expect(accountCreationService.createCheckingAccount).toHaveBeenCalledWith({
      principalId: 'principal-1',
      planId: 'plan-1',
      originDeviceId: 'web-device-1',
      idempotencyKey: 'account-request-1',
      name: 'Account Capture 1',
      balance: 123450,
      startingBalanceDate: '2026-08-17',
    });
  });

  test('rejects linked, non-Checking, or malformed defaults', async () => {
    const accountCreationService: AccountCreationService = {
      createCheckingAccount: vi.fn(),
    };
    const app = createApp(accountCreationService);
    await request(app)
      .post('/semantic/v1/plans/plan-1/accounts')
      .set('x-actual-token', 'actual-session')
      .set('x-semantic-device-id', 'web-device-1')
      .set('idempotency-key', 'account-request-1')
      .send({
        name: 'Unsupported',
        type: 'CreditCard',
        balance: 0,
        starting_balance_date: '2026-08-17',
      })
      .expect(400, {
        status: 'error',
        reason: 'invalid-account-creation-request',
      });
    expect(accountCreationService.createCheckingAccount).not.toHaveBeenCalled();
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
