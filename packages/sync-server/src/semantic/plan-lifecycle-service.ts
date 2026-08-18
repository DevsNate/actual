import { createHash, randomUUID } from 'node:crypto';

import type {
  PlanLifecycleResult,
  PlanLifecycleWriter,
} from '@actual-app/semantic-core';

type Context = {
  principalId: string;
  planId: string;
  originDeviceId: string;
  idempotencyKey: string;
};

export type PlanLifecycleService = {
  renamePlan(context: Context & { name: string }): Promise<PlanLifecycleResult>;
  deletePlan(context: Context): Promise<PlanLifecycleResult>;
};

export function createPlanLifecycleService({
  planLifecycleWriter,
  allocateId = randomUUID,
}: {
  planLifecycleWriter: PlanLifecycleWriter;
  allocateId?: () => string;
}): PlanLifecycleService {
  return {
    renamePlan(context) {
      const response = { budget_id: context.planId, name: context.name };
      return planLifecycleWriter.renamePlan({
        catalogChangeSetId: allocateId(),
        budgetChangeSetId: allocateId(),
        principalId: context.principalId,
        planId: context.planId,
        originDeviceId: context.originDeviceId,
        schemaVersion: 1,
        idempotencyKey: context.idempotencyKey,
        payloadDigest: digest('rename-plan', context, {
          name: context.name,
        }),
        newName: context.name,
        response,
      });
    },

    deletePlan(context) {
      const response = { budget_id: context.planId, deleted: true };
      return planLifecycleWriter.deletePlan({
        catalogChangeSetId: allocateId(),
        principalId: context.principalId,
        planId: context.planId,
        originDeviceId: context.originDeviceId,
        schemaVersion: 1,
        idempotencyKey: context.idempotencyKey,
        payloadDigest: digest('delete-plan', context, {}),
        response,
      });
    },
  };
}

function digest(
  commandKind: string,
  context: Pick<Context, 'principalId' | 'planId'>,
  payload: Readonly<Record<string, unknown>>,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        commandKind,
        principalId: context.principalId,
        planId: context.planId,
        payload,
      }),
    )
    .digest('hex');
}
