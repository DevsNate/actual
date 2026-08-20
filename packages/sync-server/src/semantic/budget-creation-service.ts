import { createHash, randomUUID } from 'node:crypto';

import type {
  CatalogReader,
  CreateBudgetCommand,
  CreateBudgetResult,
  BudgetCreator,
} from '@actual-app/semantic-core';
import { buildStockBudgetBootstrap } from '@actual-app/semantic-core/ynab-budget-bootstrap';

export type CreateBudgetInput = {
  principalId: string;
  originDeviceId: string;
  idempotencyKey: string;
  name: string;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
};

export type BudgetCreationService = {
  createBudget(input: CreateBudgetInput): Promise<CreateBudgetResult>;
};

type Dependencies = {
  catalogReader: CatalogReader;
  budgetCreator: BudgetCreator;
  allocateId(): string;
  now(): Date;
};

export function createBudgetCreationService(
  dependencies: Pick<Dependencies, 'catalogReader' | 'budgetCreator'> &
    Partial<Pick<Dependencies, 'allocateId' | 'now'>>,
): BudgetCreationService {
  const resolved: Dependencies = {
    allocateId: randomUUID,
    now: () => new Date(),
    ...dependencies,
  };
  return {
    async createBudget(input) {
      const catalog = await resolved.catalogReader.readCatalog(
        input.principalId,
      );
      const budgetId = resolved.allocateId();
      const budgetVersionId = resolved.allocateId();
      const membershipId = resolved.allocateId();
      const now = resolved.now();
      const receipt = { budgetId, budgetVersionId };
      const command: CreateBudgetCommand = {
        catalogChangeSetId: resolved.allocateId(),
        budgetChangeSetId: resolved.allocateId(),
        budgetId,
        budgetVersionId,
        membershipId,
        principalId: input.principalId,
        originDeviceId: input.originDeviceId,
        expectedCatalogServerKnowledge:
          catalog.knowledge.currentServerKnowledge,
        schemaVersion: 1,
        idempotencyKey: input.idempotencyKey,
        payloadDigest: digest(input),
        name: input.name,
        permissions: 1,
        currencyFormat: input.currencyFormat,
        dateFormat: input.dateFormat,
        entities: buildStockBudgetBootstrap({
          budgetId,
          budgetVersionId,
          principalId: input.principalId,
          name: input.name,
          currencyFormat: input.currencyFormat,
          dateFormat: input.dateFormat,
          createdOn: now.toISOString().slice(0, 10),
          createdAtMilliseconds: now.getTime(),
          allocateId: () => resolved.allocateId(),
        }),
        receipt,
      };
      return resolved.budgetCreator.createBudget(command);
    },
  };
}

function digest(input: CreateBudgetInput) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        commandKind: 'create-budget',
        principalId: input.principalId,
        name: input.name,
        currencyFormat: input.currencyFormat,
        dateFormat: input.dateFormat,
      }),
    )
    .digest('hex');
}
