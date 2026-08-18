import * as asyncStorage from '#platform/server/asyncStorage';
import { createApp } from '#server/app';
import { PostError } from '#server/errors';
import { getServer } from '#server/server-config';

import { createSemanticRequest } from './http';
import { getSemanticDeviceId } from './identity';
import type {
  SemanticCatalogSnapshot,
  SemanticCreatePlanResult,
  SemanticPlanFormats,
  SemanticPlanLifecycleResult,
  SemanticPlanSnapshot,
} from './types';

export type SemanticPlanHandlers = {
  'semantic-plan-catalog': typeof readCatalog;
  'semantic-plan-read': typeof readPlan;
  'semantic-plan-create': typeof createPlan;
  'semantic-plan-rename': typeof renamePlan;
  'semantic-plan-delete': typeof deletePlan;
};

export const app = createApp<SemanticPlanHandlers>();
app.method('semantic-plan-catalog', readCatalog);
app.method('semantic-plan-read', readPlan);
app.method('semantic-plan-create', createPlan);
app.method('semantic-plan-rename', renamePlan);
app.method('semantic-plan-delete', deletePlan);

async function readCatalog(): Promise<SemanticCatalogSnapshot> {
  return (await request())<SemanticCatalogSnapshot>('catalog');
}

async function readPlan({
  planId,
}: {
  planId: string;
}): Promise<SemanticPlanSnapshot> {
  return (await request())<SemanticPlanSnapshot>(
    `plans/${encodeURIComponent(planId)}`,
  );
}

async function createPlan({
  name,
  formats,
  idempotencyKey,
}: {
  name: string;
  formats: SemanticPlanFormats;
  idempotencyKey: string;
}): Promise<SemanticCreatePlanResult> {
  return (await request())<SemanticCreatePlanResult>('plans', {
    method: 'POST',
    body: { name, ...formats },
    idempotencyKey,
  });
}

async function renamePlan({
  planId,
  name,
  idempotencyKey,
}: {
  planId: string;
  name: string;
  idempotencyKey: string;
}): Promise<SemanticPlanLifecycleResult> {
  return (await request())<SemanticPlanLifecycleResult>(
    `plans/${encodeURIComponent(planId)}`,
    { method: 'PATCH', body: { name }, idempotencyKey },
  );
}

async function deletePlan({
  planId,
  idempotencyKey,
}: {
  planId: string;
  idempotencyKey: string;
}): Promise<SemanticPlanLifecycleResult> {
  return (await request())<SemanticPlanLifecycleResult>(
    `plans/${encodeURIComponent(planId)}`,
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
