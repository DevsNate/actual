import { createHash, randomUUID } from 'node:crypto';

import type {
  BudgetLifecycleResult,
  BudgetLifecycleWriter,
} from '@actual-app/semantic-core';

type Context = {
  principalId: string;
  budgetId: string;
  originDeviceId: string;
  idempotencyKey: string;
  catalogDeviceKnowledge?: { starting: number; ending: number };
};

export type BudgetLifecycleService = {
  renameBudget(
    context: Context & {
      name: string;
      budgetDeviceKnowledge?: { starting: number; ending: number };
    },
  ): Promise<BudgetLifecycleResult>;
  deleteBudget(context: Context): Promise<BudgetLifecycleResult>;
};

export function createBudgetLifecycleService({
  budgetLifecycleWriter,
  allocateId = randomUUID,
}: {
  budgetLifecycleWriter: BudgetLifecycleWriter;
  allocateId?: () => string;
}): BudgetLifecycleService {
  return {
    renameBudget(context) {
      const receipt = {
        budgetId: context.budgetId,
        kind: 'renamed' as const,
        name: context.name,
      };
      return budgetLifecycleWriter.renameBudget({
        catalogChangeSetId: allocateId(),
        budgetChangeSetId: allocateId(),
        principalId: context.principalId,
        budgetId: context.budgetId,
        originDeviceId: context.originDeviceId,
        schemaVersion: 1,
        idempotencyKey: context.idempotencyKey,
        payloadDigest: digest('rename-budget', context, {
          name: context.name,
        }),
        newName: context.name,
        catalogDeviceKnowledge: context.catalogDeviceKnowledge,
        budgetDeviceKnowledge: context.budgetDeviceKnowledge,
        receipt,
      });
    },

    deleteBudget(context) {
      const receipt = {
        budgetId: context.budgetId,
        kind: 'deleted' as const,
      };
      return budgetLifecycleWriter.deleteBudget({
        catalogChangeSetId: allocateId(),
        principalId: context.principalId,
        budgetId: context.budgetId,
        originDeviceId: context.originDeviceId,
        schemaVersion: 1,
        idempotencyKey: context.idempotencyKey,
        payloadDigest: digest('delete-budget', context, {}),
        catalogDeviceKnowledge: context.catalogDeviceKnowledge,
        receipt,
      });
    },
  };
}

function digest(
  commandKind: string,
  context: Pick<Context, 'principalId' | 'budgetId'>,
  payload: Readonly<Record<string, unknown>>,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        commandKind,
        principalId: context.principalId,
        budgetId: context.budgetId,
        payload,
      }),
    )
    .digest('hex');
}
