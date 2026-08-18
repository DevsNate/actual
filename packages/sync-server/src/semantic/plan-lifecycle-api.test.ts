import type {
  AuthenticatedPrincipal,
  DeletePlanCommand,
  PlanLifecycleWriter,
  RenamePlanCommand,
} from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import { createSemanticPlanLifecycleHandlers } from './plan-lifecycle-api';

const principal: AuthenticatedPrincipal = {
  id: 'principal-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

test('translates rename and delete into scoped lifecycle commands', async () => {
  let rename: RenamePlanCommand | undefined;
  let deletion: DeletePlanCommand | undefined;
  const writer: PlanLifecycleWriter = {
    renamePlan: vi.fn(async command => {
      rename = command;
      return {
        replayed: false,
        catalogServerKnowledge: 4,
        budgetServerKnowledge: 2,
        response: command.response,
      };
    }),
    deletePlan: vi.fn(async command => {
      deletion = command;
      return {
        replayed: false,
        catalogServerKnowledge: 5,
        budgetServerKnowledge: null,
        response: command.response,
      };
    }),
  };
  const app = express();
  let id = 0;
  app.use(
    '/semantic/v1',
    createSemanticPlanLifecycleHandlers({
      planLifecycleWriter: writer,
      resolvePrincipal: () => principal,
      allocateId: () => `change-${++id}`,
    }),
  );

  await request(app)
    .patch('/semantic/v1/plans/plan-1')
    .set('x-actual-token', 'session')
    .set('x-semantic-device-id', 'device-1')
    .set('idempotency-key', 'rename-1')
    .send({ name: 'Renamed' })
    .expect(200);
  expect(rename).toMatchObject({
    catalogChangeSetId: 'change-1',
    budgetChangeSetId: 'change-2',
    principalId: 'principal-1',
    planId: 'plan-1',
    newName: 'Renamed',
  });

  await request(app)
    .delete('/semantic/v1/plans/plan-1')
    .set('x-actual-token', 'session')
    .set('x-semantic-device-id', 'device-1')
    .set('idempotency-key', 'delete-1')
    .expect(200);
  expect(deletion).toMatchObject({
    catalogChangeSetId: 'change-3',
    principalId: 'principal-1',
    planId: 'plan-1',
  });
});

test('rejects incomplete requests before calling storage', async () => {
  const writer: PlanLifecycleWriter = {
    renamePlan: vi.fn(),
    deletePlan: vi.fn(),
  };
  const app = express();
  app.use(
    '/semantic/v1',
    createSemanticPlanLifecycleHandlers({
      planLifecycleWriter: writer,
      resolvePrincipal: () => principal,
    }),
  );
  await request(app)
    .patch('/semantic/v1/plans/plan-1')
    .set('x-actual-token', 'session')
    .send({ name: '' })
    .expect(400);
  expect(writer.renamePlan).not.toHaveBeenCalled();
});
