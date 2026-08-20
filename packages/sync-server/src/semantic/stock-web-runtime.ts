import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';
import type { NextFunction, RequestHandler } from 'express';
import express from 'express';

const SESSION_COOKIE = 'actual-stock-session';

type LoginResult = { token?: string; error?: string };

type Dependencies = {
  root: string;
  loginWithPassword(password: string): Promise<LoginResult>;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
  loginRateLimiter?: RequestHandler;
};

export function createStockWebRuntime(dependencies: Dependencies) {
  const handlers = express.Router();
  const template = fs.readFileSync(
    path.join(dependencies.root, 'index.html'),
    'utf8',
  );

  handlers.get('/stock-web/login', (_request, response) => {
    response.type('html').send(loginPage());
  });
  handlers.post(
    '/stock-web/login',
    express.urlencoded({ extended: false, limit: '8kb' }),
    dependencies.loginRateLimiter ?? passThrough,
    async (request, response) => {
      const password =
        typeof request.body?.password === 'string' ? request.body.password : '';
      const result = await dependencies.loginWithPassword(password);
      if (!result.token || result.error) {
        response.status(401).type('html').send(loginPage('Sign in failed.'));
        return;
      }
      response.cookie(SESSION_COOKIE, result.token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: request.secure,
        path: '/',
      });
      response.redirect(303, '/users/budgets');
    },
  );

  handlers.use(express.static(dependencies.root, { index: false }));
  handlers.get('/{*splat}', (request, response) => {
    const sessionToken = readCookie(request, SESSION_COOKIE);
    const principal = sessionToken
      ? resolvePrincipal(sessionToken, dependencies)
      : null;
    if (!sessionToken || !principal) {
      response.redirect(302, '/stock-web/login');
      return;
    }
    const origin = `${request.protocol}://${request.get('host')}`;
    response
      .type('html')
      .send(
        renderStockIndex(
          template,
          origin,
          sessionToken,
          randomBytes(32).toString('base64url'),
          principal,
        ),
      );
  });
  return handlers;
}

export function renderStockIndex(
  template: string,
  serverOrigin: string,
  sessionToken: string,
  csrfToken: string,
  principal: AuthenticatedPrincipal,
): string {
  return template
    .replace(
      /"YNAB_SERVER_URL":"[^"]*"/,
      `"YNAB_SERVER_URL":${JSON.stringify(serverOrigin)}`,
    )
    .replace(/"CASTLE_USER_JWT":"[^"]*"/, '"CASTLE_USER_JWT":""')
    .replace(
      /"USER_HELP_ACCESS_INITIAL_JWT":"[^"]*"/,
      '"USER_HELP_ACCESS_INITIAL_JWT":""',
    )
    .replace(
      /"USER":\{[^}]*\}/,
      `"USER":${JSON.stringify({
        id: principal.id,
        email: principal.loginName,
      })}`,
    )
    .replace(
      /(<meta name="csrf-token" content=")[^"]*("\s*\/>)/,
      `$1${csrfToken}$2`,
    )
    .replace(
      /(<meta name="session-token" content=")[^"]*("\s*\/>)/,
      `$1${sessionToken}$2`,
    );
}

function resolvePrincipal(
  token: string,
  dependencies: Dependencies,
): AuthenticatedPrincipal | null {
  try {
    return dependencies.resolvePrincipal(token);
  } catch {
    return null;
  }
}

function readCookie(request: express.Request, name: string): string | null {
  const header = request.get('cookie');
  if (!header) {
    return null;
  }
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) {
      continue;
    }
    if (item.slice(0, separator).trim() === name) {
      return decodeURIComponent(item.slice(separator + 1).trim());
    }
  }
  return null;
}

function loginPage(error = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in</title></head>
<body><main><h1>Sign in to the project server</h1>${error ? `<p role="alert">${error}</p>` : ''}<form method="post" action="/stock-web/login"><label>Password <input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form></main></body></html>`;
}

function passThrough(
  _request: express.Request,
  _response: express.Response,
  next: NextFunction,
) {
  next();
}
