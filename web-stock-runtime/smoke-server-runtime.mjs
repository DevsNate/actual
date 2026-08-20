import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const baseUrl = process.env.STOCK_WEB_SMOKE_URL ?? 'http://127.0.0.1:5007';
const runtimeRoot =
  process.env.ACTUAL_STOCK_WEB_RUNTIME_ROOT ??
  fileURLToPath(new URL('./vendor/current/', import.meta.url));
const password = randomBytes(24).toString('hex');
const capturedTemplate = readFileSync(`${runtimeRoot}/index.html`, 'utf8');
const capturedSession = capturedTemplate.match(
  /<meta name="session-token" content="([^"]*)"/,
)?.[1];

async function requestJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  if (!response.ok || body.status !== 'ok') {
    throw new Error(`${path} failed with HTTP ${response.status}`);
  }
  return { response, body };
}

const bootstrap = await requestJson('/account/bootstrap', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password }),
});

const login = await requestJson('/account/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password }),
});
const sessionToken = login.body.data?.token;
if (typeof sessionToken !== 'string' || !sessionToken) {
  throw new Error('Actual login did not return a session token');
}

const plan = await requestJson('/semantic/v1/plans', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'idempotency-key': 'stock-runtime-smoke-plan',
    'x-actual-token': sessionToken,
    'x-semantic-device-id': 'stock-runtime-smoke-device',
  },
  body: JSON.stringify({
    name: 'Stock Runtime Smoke',
    currency_format: {
      iso_code: 'USD',
      example_format: '123,456.78',
      decimal_digits: 2,
      decimal_separator: '.',
      group_separator: ',',
      currency_symbol: '$',
      display_symbol: true,
      symbol_first: true,
    },
    date_format: { format: 'MM/DD/YYYY' },
  }),
});

const stockLogin = await fetch(`${baseUrl}/stock-web/login`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password }),
});
if (stockLogin.status !== 303) {
  throw new Error(`Stock login failed with HTTP ${stockLogin.status}`);
}
const cookie = stockLogin.headers.get('set-cookie')?.split(';', 1)[0];
if (!cookie) {
  throw new Error('Stock login did not set a session cookie');
}

const shell = await fetch(`${baseUrl}/users/budgets`, {
  headers: { cookie },
});
const html = await shell.text();
if (!shell.ok) {
  throw new Error(`Stock shell failed with HTTP ${shell.status}`);
}

const csp = shell.headers.get('content-security-policy') ?? '';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const firstPartyRequests = [];
const catalogOperations = [];
const catalogRequests = [];
const failedRequests = [];
const pageErrors = [];
const consoleErrors = [];
const nonOkResponses = [];
page.on('request', request => {
  if (request.url().startsWith(baseUrl)) {
    const path = new URL(request.url()).pathname;
    firstPartyRequests.push(path);
    if (path === '/api/v1/catalog' && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (typeof body?.operation_name === 'string') {
        catalogOperations.push(body.operation_name);
        const requestData = JSON.parse(body.request_data);
        catalogRequests.push({
          operation: body.operation_name,
          keys: Object.keys(requestData).sort(),
          startingDeviceKnowledge: requestData.starting_device_knowledge,
          endingDeviceKnowledge: requestData.ending_device_knowledge,
          deviceKnowledgeOfServer: requestData.device_knowledge_of_server,
          changedEntityKeys: Object.keys(
            requestData.changed_entities ?? {},
          ).sort(),
          changedEntities: requestData.changed_entities ?? {},
        });
      }
    }
  }
});
page.on('requestfailed', request => {
  if (request.url().startsWith(baseUrl)) {
    failedRequests.push(new URL(request.url()).pathname);
  }
});
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});
page.on('response', response => {
  if (response.url().startsWith(baseUrl) && !response.ok()) {
    nonOkResponses.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
  }
});
await page.route('**/*', route => {
  const requestOrigin = new URL(route.request().url()).origin;
  return requestOrigin === new URL(baseUrl).origin
    ? route.continue()
    : route.abort('blockedbyclient');
});
await page.goto(`${baseUrl}/stock-web/login`, {
  waitUntil: 'domcontentloaded',
});
await page.getByLabel('Password').fill(password);
await Promise.all([
  page.waitForURL(url => !url.pathname.startsWith('/stock-web/login')),
  page.getByRole('button', { name: 'Sign in' }).click(),
]);
await page.waitForTimeout(15000);
const planLink = page.getByRole('button', { name: 'Stock Runtime Smoke' });
const browserPlanVisible = (await planLink.count()) > 0;
if (browserPlanVisible) {
  await planLink.click({ force: true });
  await page.waitForTimeout(15000);
}
const browserPath = new URL(page.url()).pathname;
await browser.close();

const unexpectedConsoleErrors = consoleErrors.filter(
  message =>
    !message.includes('violates the following Content Security Policy') &&
    !message.includes('net::ERR_BLOCKED_BY_CLIENT'),
);
const unexpectedResponses = nonOkResponses.filter(
  response => ![301, 302, 303].includes(response.status),
);

const assertions = {
  bootstrapHttp: bootstrap.response.status,
  loginHttp: login.response.status,
  planHttp: plan.response.status,
  stockLoginHttp: stockLogin.status,
  shellHttp: shell.status,
  planIdPresent: typeof plan.body.data?.budget_id === 'string',
  projectOriginPresent: html.includes(baseUrl),
  capturedOriginAbsent: !html.includes(
    '"YNAB_SERVER_URL":"https://app.ynab.com"',
  ),
  inlineBootstrapAllowed: csp.includes("'unsafe-inline'"),
  capturedSessionAbsent:
    typeof capturedSession === 'string' && !html.includes(capturedSession),
  browserLoadedScripts: firstPartyRequests.some(path => path.endsWith('.js')),
  browserCalledCatalog: firstPartyRequests.includes('/api/v1/catalog'),
  browserCalledInitialUser: catalogOperations.includes('getInitialUserData'),
  browserCalledCatalogSync: catalogOperations.includes('syncCatalogData'),
  browserCalledFamilySync: catalogOperations.includes('syncFamilyData'),
  browserCalledBudgetSync: catalogOperations.includes('syncBudgetData'),
  browserCalledUser: firstPartyRequests.includes('/api/v2/user'),
  browserFirstPartyFailures: failedRequests.length,
  browserPageErrors: pageErrors.length,
  browserUnexpectedConsoleErrors: unexpectedConsoleErrors.length,
  browserUnexpectedResponses: unexpectedResponses.length,
  browserPlanVisible,
  browserPath,
  catalogOperations: [...new Set(catalogOperations)],
};

if (
  Object.values(assertions).includes(false) ||
  assertions.browserFirstPartyFailures !== 0 ||
  assertions.browserPageErrors !== 0 ||
  assertions.browserUnexpectedConsoleErrors !== 0 ||
  assertions.browserUnexpectedResponses !== 0
) {
  throw new Error(
    `Stock runtime assertion failed: ${JSON.stringify({
      assertions,
      consoleErrors: unexpectedConsoleErrors.slice(0, 8),
      pageErrors: pageErrors.slice(0, 8),
      nonOkResponses: unexpectedResponses,
      catalogRequests,
    })}`,
  );
}

console.log(JSON.stringify(assertions, null, 2));
