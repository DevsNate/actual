import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import { AuthenticationError } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import { createStockUserGateway } from './stock-user-gateway';

const principal: AuthenticatedPrincipal = {
  id: 'user-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

describe('stock user gateway', () => {
  test('projects the captured user response shape', async () => {
    const app = express().use(
      '/api/v2',
      createStockUserGateway({ resolvePrincipal: () => principal }),
    );

    await request(app)
      .get('/api/v2/user')
      .set('x-session-token', 'session')
      .expect(200, {
        id: 'user-1',
        email: 'person@example.com',
        first_name: 'Person',
        family_role: 'plan_manager',
        confirmed: true,
        is_tombstone: false,
      });
  });

  test('rejects an invalid Actual session', async () => {
    const app = express().use(
      '/api/v2',
      createStockUserGateway({
        resolvePrincipal: () => {
          throw new AuthenticationError('invalid-session', 'invalid');
        },
      }),
    );

    await request(app)
      .get('/api/v2/user')
      .expect(401, {
        error: { id: 'invalid-session' },
      });
  });
});
