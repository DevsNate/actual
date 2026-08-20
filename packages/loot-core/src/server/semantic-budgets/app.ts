import * as asyncStorage from '#platform/server/asyncStorage';
import { createApp } from '#server/app';
import { PostError } from '#server/errors';
import { getServer } from '#server/server-config';

import { createSemanticRequest } from './http';
import { getSemanticDeviceId } from './identity';
import type {
  SemanticCatalogSnapshot,
  SemanticCreateBudgetResult,
  SemanticBudgetFormats,
  SemanticBudgetLifecycleResult,
  SemanticBudgetSnapshot,
} from './types';

export type SemanticBudgetHandlers = {
  'semantic-budget-catalog': typeof readCatalog;
  'semantic-budget-read': typeof readBudget;
  'semantic-budget-create': typeof createBudget;
  'semantic-budget-rename': typeof renameBudget;
  'semantic-budget-delete': typeof deleteBudget;
};

export const app = createApp<SemanticBudgetHandlers>();
app.method('semantic-budget-catalog', readCatalog);
app.method('semantic-budget-read', readBudget);
app.method('semantic-budget-create', createBudget);
app.method('semantic-budget-rename', renameBudget);
app.method('semantic-budget-delete', deleteBudget);

async function readCatalog(): Promise<SemanticCatalogSnapshot> {
  return (await request())<SemanticCatalogSnapshot>('catalog');
}

async function readBudget({
  budgetId,
}: {
  budgetId: string;
}): Promise<SemanticBudgetSnapshot> {
  return (await request())<SemanticBudgetSnapshot>(
    `budgets/${encodeURIComponent(budgetId)}`,
  );
}

async function createBudget({
  name,
  formats,
  idempotencyKey,
}: {
  name: string;
  formats: SemanticBudgetFormats;
  idempotencyKey: string;
}): Promise<SemanticCreateBudgetResult> {
  return (await request())<SemanticCreateBudgetResult>('budgets', {
    method: 'POST',
    body: { name, ...formats },
    idempotencyKey,
  });
}

async function renameBudget({
  budgetId,
  name,
  idempotencyKey,
}: {
  budgetId: string;
  name: string;
  idempotencyKey: string;
}): Promise<SemanticBudgetLifecycleResult> {
  return (await request())<SemanticBudgetLifecycleResult>(
    `budgets/${encodeURIComponent(budgetId)}`,
    { method: 'PATCH', body: { name }, idempotencyKey },
  );
}

async function deleteBudget({
  budgetId,
  idempotencyKey,
}: {
  budgetId: string;
  idempotencyKey: string;
}): Promise<SemanticBudgetLifecycleResult> {
  return (await request())<SemanticBudgetLifecycleResult>(
    `budgets/${encodeURIComponent(budgetId)}`,
    { method: 'DELETE', idempotencyKey },
  );
}

async function request() {
  const server = getServer();
  const token = await asyncStorage.getItem('user-token');
  if (!server || !token) {
    throw new PostError('semantic-auth-unavailable');
  }
  return createSemanticRequest({
    baseUrl: server.BASE_SERVER,
    token,
    deviceId: await getSemanticDeviceId(),
  });
}
