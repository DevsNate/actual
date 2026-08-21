import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const baseUrl = process.env.STOCK_WEB_SMOKE_URL ?? 'http://127.0.0.1:5007';
const createPlanThroughStock =
  process.env.STOCK_WEB_SMOKE_CREATE_PLAN === 'true';
const createTransactionThroughStock =
  process.env.STOCK_WEB_SMOKE_CREATE_TRANSACTION === 'true';
const createAccountThroughStock =
  createTransactionThroughStock ||
  process.env.STOCK_WEB_SMOKE_CREATE_ACCOUNT === 'true';
const transactionSyncWaitMs = Number(
  process.env.STOCK_WEB_SMOKE_SYNC_WAIT_MS ?? '65000',
);
if (createPlanThroughStock && createAccountThroughStock) {
  throw new Error('Stock runtime smoke supports one creation mode at a time');
}
const expectEmptyPicker =
  createPlanThroughStock || process.env.STOCK_WEB_SMOKE_EMPTY === 'true';
const runtimeRoot =
  process.env.ACTUAL_STOCK_WEB_RUNTIME_ROOT ??
  fileURLToPath(new URL('./vendor/current/', import.meta.url));
const configuredPassword = process.env.STOCK_WEB_SMOKE_PASSWORD;
const password = configuredPassword ?? randomBytes(24).toString('hex');
const stockAccountName =
  process.env.STOCK_WEB_SMOKE_ACCOUNT_NAME ?? 'Stock Runtime Checking';
const stockTransactionMemo = 'Stock Runtime Ordinary';
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

const bootstrap = configuredPassword
  ? null
  : await requestJson('/account/bootstrap', {
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

const budget = expectEmptyPicker
  ? null
  : await requestJson('/semantic/v1/budgets', {
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
const stockPlanRequests = [];
const failedRequests = [];
const pageErrors = [];
const consoleErrors = [];
const nonOkResponses = [];
const budgetSyncResponses = [];
page.on('request', request => {
  if (request.url().startsWith(baseUrl)) {
    const path = new URL(request.url()).pathname;
    firstPartyRequests.push(path);
    if (path === '/api/budgets' && request.method() === 'POST') {
      stockPlanRequests.push(request.postDataJSON());
    }
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
  if (
    response.url().startsWith(baseUrl) &&
    new URL(response.url()).pathname === '/api/v1/catalog' &&
    response.request().method() === 'POST'
  ) {
    const body = response.request().postDataJSON();
    if (body?.operation_name === 'syncBudgetData') {
      const requestData = JSON.parse(body.request_data);
      budgetSyncResponses.push({
        status: response.status(),
        changedEntityKeys: Object.keys(
          requestData.changed_entities ?? {},
        ).sort(),
      });
    }
  }
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
let browserPlanVisible = (await planLink.count()) > 0;
const initialEmptyPickerVisible =
  (await page.getByRole('button', { name: 'Create New Plan' }).count()) > 0;
let browserCreatedPlan = false;
let stockPlanResponse = null;
let browserCreatedAccount = false;
let stockAccountResponse = null;
let browserCreatedTransaction = false;
let stockTransactionResponse = null;
if (createPlanThroughStock) {
  await page.getByRole('button', { name: 'Create New Plan' }).click();
  await page
    .locator('#modal-settings-budget-name')
    .fill('Stock Runtime Created Plan');
  const [response] = await Promise.all([
    page.waitForResponse(
      response =>
        new URL(response.url()).pathname === '/api/budgets' &&
        response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Create Plan' }).click(),
  ]);
  stockPlanResponse = {
    status: response.status(),
    body: await response.json(),
  };
  await page.waitForURL(/\/[0-9a-f-]+\/budget$/u);
  await page.waitForTimeout(15000);
  browserCreatedPlan =
    (await page
      .getByRole('button', { name: /Stock Runtime Created Plan/u })
      .count()) > 0;
} else if (browserPlanVisible) {
  await planLink.click({ force: true });
  await page.waitForTimeout(15000);
}
if (createAccountThroughStock) {
  await page.getByRole('button', { name: 'Add Account' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Next' }).click();
  let accountDialog = page.getByRole('dialog');
  await accountDialog.getByRole('textbox').nth(0).fill(stockAccountName);
  await accountDialog
    .getByRole('button', { name: 'Select account type...' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Checking' })
    .click();
  accountDialog = page.getByRole('dialog');
  await accountDialog.getByRole('textbox').nth(1).fill('0');
  const [response] = await Promise.all([
    page.waitForResponse(response => {
      const path = new URL(response.url()).pathname;
      return (
        /\/direct_import\/budgets\/[^/]+\/accounts$/u.test(path) &&
        response.request().method() === 'POST'
      );
    }),
    accountDialog.getByRole('button', { name: 'Next' }).click(),
  ]);
  stockAccountResponse = {
    status: response.status(),
    body: await response.json(),
  };
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]+$/u);
  browserCreatedAccount =
    (await page
      .getByRole('link', { name: new RegExp(stockAccountName, 'u') })
      .count()) === 1;
}
if (createTransactionThroughStock) {
  await page.getByRole('button', { name: /Add Transaction/u }).click();
  await page.getByRole('textbox', { name: 'memo' }).fill(stockTransactionMemo);
  await page.getByRole('textbox', { name: 'outflow' }).fill('1.23');
  const responseStart = budgetSyncResponses.length;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(transactionSyncWaitMs);
  stockTransactionResponse = budgetSyncResponses
    .slice(responseStart)
    .find(response =>
      response.changedEntityKeys.includes('be_transaction_groups'),
    );
  browserCreatedTransaction =
    (await page.getByText(stockTransactionMemo, { exact: true }).count()) > 0;
}
browserPlanVisible = (await planLink.count()) > 0;
const browserBodyText = expectEmptyPicker
  ? (await page.locator('body').innerText()).slice(0, 2000)
  : '';
const browserPath = new URL(page.url()).pathname;
await browser.close();

const budgetRead = createAccountThroughStock
  ? await requestJson(`/semantic/v1/budgets/${budget?.body.data?.budget_id}`, {
      headers: { 'x-actual-token': sessionToken },
    })
  : null;
const createdAccountEntities = budgetRead?.body.data?.entities?.filter(
  entity =>
    entity?.isTombstone === false &&
    (entity?.payload?.accountName === stockAccountName ||
      entity?.payload?.name === `Transfer : ${stockAccountName}`),
);
const createdAccountId = createdAccountEntities?.find(
  entity => entity.entityKind === 'be_accounts',
)?.entityId;
const createdStartingBalance = budgetRead?.body.data?.entities?.find(
  entity =>
    entity?.entityKind === 'be_transactions' &&
    entity?.isTombstone === false &&
    entity?.payload?.accountId === createdAccountId &&
    entity?.payload?.amount === 0,
);
const createdOrdinaryTransaction = budgetRead?.body.data?.entities?.find(
  entity =>
    entity?.entityKind === 'be_transactions' &&
    entity?.isTombstone === false &&
    entity?.payload?.accountId === createdAccountId &&
    entity?.payload?.memo === stockTransactionMemo &&
    entity?.payload?.amount === -1230,
);

const unexpectedConsoleErrors = consoleErrors.filter(
  message =>
    !message.includes('violates the following Content Security Policy') &&
    !message.includes('net::ERR_BLOCKED_BY_CLIENT'),
);
const unexpectedResponses = nonOkResponses.filter(
  response => ![301, 302, 303].includes(response.status),
);

const assertions = {
  bootstrapHttp: bootstrap?.response.status ?? null,
  loginHttp: login.response.status,
  budgetHttp: budget?.response.status ?? null,
  stockLoginHttp: stockLogin.status,
  shellHttp: shell.status,
  budgetCreationMatchesMode: expectEmptyPicker
    ? budget === null
    : typeof budget?.body.data?.budget_id === 'string',
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
  budgetSyncMatchesMode:
    createPlanThroughStock || !expectEmptyPicker
      ? catalogOperations.includes('syncBudgetData')
      : !catalogOperations.includes('syncBudgetData'),
  stockPlanCreationMatchesMode: createPlanThroughStock
    ? stockPlanRequests.length === 1 &&
      stockPlanResponse?.status === 201 &&
      typeof stockPlanResponse?.body?.id === 'string'
    : stockPlanRequests.length === 0,
  stockAccountCreationMatchesMode: createAccountThroughStock
    ? stockAccountResponse?.status === 201 &&
      typeof stockAccountResponse?.body?.id === 'string' &&
      browserCreatedAccount
    : stockAccountResponse === null,
  stockAccountReadbackMatchesMode: createAccountThroughStock
    ? createdAccountEntities?.some(
        entity => entity.entityKind === 'be_accounts',
      ) === true &&
      createdAccountEntities?.some(
        entity => entity.entityKind === 'be_payees',
      ) === true &&
      createdStartingBalance !== undefined
    : budgetRead === null,
  stockTransactionCreationMatchesMode: createTransactionThroughStock
    ? stockTransactionResponse?.status === 200 && browserCreatedTransaction
    : stockTransactionResponse === null,
  stockTransactionReadbackMatchesMode: createTransactionThroughStock
    ? createdOrdinaryTransaction !== undefined
    : createdOrdinaryTransaction === undefined,
  browserCalledUser: firstPartyRequests.includes('/api/v2/user'),
  browserFirstPartyFailures: failedRequests.length,
  browserPageErrors: pageErrors.length,
  browserUnexpectedConsoleErrors: unexpectedConsoleErrors.length,
  browserUnexpectedResponses: unexpectedResponses.length,
  browserPlanStateMatchesMode: createPlanThroughStock
    ? initialEmptyPickerVisible && browserCreatedPlan
    : expectEmptyPicker
      ? initialEmptyPickerVisible && !browserPlanVisible
      : browserPlanVisible,
  browserPathMatchesMode: createAccountThroughStock
    ? /\/accounts\/[0-9a-f-]+$/u.test(browserPath)
    : createPlanThroughStock || !expectEmptyPicker
      ? browserPath.endsWith('/budget')
      : browserPath.startsWith('/users/budgets'),
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
      browserBodyText,
      consoleErrors: unexpectedConsoleErrors.slice(0, 8),
      pageErrors: pageErrors.slice(0, 8),
      nonOkResponses: unexpectedResponses,
      catalogRequests,
    })}`,
  );
}

console.log(JSON.stringify(assertions, null, 2));
