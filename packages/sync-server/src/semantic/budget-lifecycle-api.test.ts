import type {
  AuthenticatedPrincipal,
  DeleteBudgetCommand,
  BudgetLifecycleWriter,
  RenameBudgetCommand,
} from '@actual-app/semantic-core';
import express from 'express';
import request from 'supertest';

import { createSemanticBudgetLifecycleHandlers } from './budget-lifecycle-api';
import { createBudgetLifecycleService } from './budget-lifecycle-service';

const principal: AuthenticatedPrincipal = {
  id: 'principal-1',
  loginName: 'person@example.com',
  displayName: 'Person',
  role: 'BASIC',
};

test('translates rename and delete into scoped lifecycle commands', async () => {
  let rename: RenameBudgetCommand | undefined;
  let deletion: DeleteBudgetCommand | undefined;
  const writer: BudgetLifecycleWriter = {
    renameBudget: vi.fn(async command => {
      rename = command;
      return {
        replayed: false,
        catalogServerKnowledge: 4,
        budgetServerKnowledge: 2,
        budget: command.receipt,
      };
    }),
    deleteBudget: vi.fn(async command => {
      deletion = command;
      return {
        replayed: false,
        catalogServerKnowledge: 5,
        budgetServerKnowledge: null,
        budget: command.receipt,
      };
    }),
  };
  const app = express();
  let id = 0;
  const budgetLifecycleService = createBudgetLifecycleService({
    budgetLifecycleWriter: writer,
    allocateId: () => `change-${++id}`,
  });
  app.use(
    '/semantic/v1',
    createSemanticBudgetLifecycleHandlers({
      budgetLifecycleService,
      resolvePrincipal: () => principal,
    }),
  );

  await request(app)
    .patch('/semantic/v1/budgets/plan-1')
    .set('x-actual-token', 'session')
    .set('x-semantic-device-id', 'device-1')
    .set('idempotency-key', 'rename-1')
    .send({ name: 'Renamed' })
    .expect(200);
  expect(rename).toMatchObject({
    catalogChangeSetId: 'change-1',
    budgetChangeSetId: 'change-2',
    principalId: 'principal-1',
    budgetId: 'plan-1',
    newName: 'Renamed',
  });

  await request(app)
    .delete('/semantic/v1/budgets/plan-1')
    .set('x-actual-token', 'session')
    .set('x-semantic-device-id', 'device-1')
    .set('idempotency-key', 'delete-1')
    .expect(200);
  expect(deletion).toMatchObject({
    catalogChangeSetId: 'change-3',
    principalId: 'principal-1',
    budgetId: 'plan-1',
  });
});

test('rejects incomplete requests before calling storage', async () => {
  const writer: BudgetLifecycleWriter = {
    renameBudget: vi.fn(),
    deleteBudget: vi.fn(),
  };
  const app = express();
  app.use(
    '/semantic/v1',
    createSemanticBudgetLifecycleHandlers({
      budgetLifecycleService: createBudgetLifecycleService({
        budgetLifecycleWriter: writer,
      }),
      resolvePrincipal: () => principal,
    }),
  );
  await request(app)
    .patch('/semantic/v1/budgets/plan-1')
    .set('x-actual-token', 'session')
    .send({ name: '' })
    .expect(400);
  expect(writer.renameBudget).not.toHaveBeenCalled();
});
