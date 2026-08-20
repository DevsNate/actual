import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import { createStockWebRuntime, renderStockIndex } from './stock-web-runtime';

const principal: AuthenticatedPrincipal = {
  id: 'user-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

const template = `<html><head>
<meta name="csrf-token" content="captured-csrf" />
<meta name="session-token" content="captured-session" />
<script>window.env={"YNAB_SERVER_URL":"https://app.ynab.com","CASTLE_USER_JWT":"captured-jwt","USER_HELP_ACCESS_INITIAL_JWT":"captured-help-jwt","USER":{"id":"captured-user","email":"captured@example.com"}}</script>
</head><body>shell</body></html>`;

describe('stock web runtime', () => {
  test('rewrites only infrastructure/session boundaries', () => {
    const rendered = renderStockIndex(
      template,
      'https://budget.example',
      'actual-session',
      'fresh-csrf',
      principal,
    );
    expect(rendered).toContain('"YNAB_SERVER_URL":"https://budget.example"');
    expect(rendered).toContain('content="actual-session"');
    expect(rendered).toContain('content="fresh-csrf"');
    expect(rendered).toContain('"CASTLE_USER_JWT":""');
    expect(rendered).toContain('"USER_HELP_ACCESS_INITIAL_JWT":""');
    expect(rendered).toContain(
      '"USER":{"id":"user-1","email":"person@example.com"}',
    );
    expect(rendered).not.toContain('captured-session');
    expect(rendered).not.toContain('captured-csrf');
    expect(rendered).not.toContain('captured-jwt');
    expect(rendered).not.toContain('captured-help-jwt');
    expect(rendered).not.toContain('captured-user');
  });

  test('uses Actual password auth and an HttpOnly session cookie', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-web-runtime-'));
    fs.writeFileSync(path.join(root, 'index.html'), template);
    const app = express().use(
      createStockWebRuntime({
        root,
        loginWithPassword: async password =>
          password === 'correct'
            ? { token: 'actual-session' }
            : { error: 'invalid-password' },
        resolvePrincipal: token => {
          if (token !== 'actual-session') {
            throw new Error('invalid');
          }
          return principal;
        },
      }),
    );

    await request(app)
      .get('/users/budgets')
      .expect(302, /stock-web\/login/);
    const login = await request(app)
      .post('/stock-web/login')
      .type('form')
      .send({ password: 'correct' })
      .expect(303);
    const cookie = login.headers['set-cookie']?.[0];
    expect(cookie).toContain('actual-stock-session=actual-session');
    expect(cookie).toContain('HttpOnly');

    const response = await request(app)
      .get('/users/budgets')
      .set('cookie', cookie!)
      .expect(200);
    expect(response.text).toContain('"YNAB_SERVER_URL":"http://127.0.0.1');
    expect(response.text).toContain('content="actual-session"');
  });
});
