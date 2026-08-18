import { send } from '@actual-app/core/platform/client/connection';
import type {
  SemanticCatalogSnapshot,
  SemanticCreatePlanResult,
  SemanticPlanFormats,
  SemanticPlanLifecycleResult,
  SemanticPlanSnapshot,
} from '@actual-app/core/server/semantic-plans/types';
import { v4 as uuidv4 } from 'uuid';

export function createSemanticPlanApi({
  sendCommand = send,
  allocateCommandId = uuidv4,
}: {
  sendCommand?: typeof send;
  allocateCommandId?: () => string;
} = {}) {
  return {
    readCatalog(): Promise<SemanticCatalogSnapshot> {
      return sendCommand('semantic-plan-catalog');
    },

    readPlan(planId: string): Promise<SemanticPlanSnapshot> {
      return sendCommand('semantic-plan-read', { planId });
    },

    createPlan(
      name: string,
      formats: SemanticPlanFormats,
    ): Promise<SemanticCreatePlanResult> {
      return sendCommand('semantic-plan-create', {
        name,
        formats,
        idempotencyKey: allocateCommandId(),
      });
    },

    renamePlan(
      planId: string,
      name: string,
    ): Promise<SemanticPlanLifecycleResult> {
      return sendCommand('semantic-plan-rename', {
        planId,
        name,
        idempotencyKey: allocateCommandId(),
      });
    },

    deletePlan(planId: string): Promise<SemanticPlanLifecycleResult> {
      return sendCommand('semantic-plan-delete', {
        planId,
        idempotencyKey: allocateCommandId(),
      });
    },
  };
}

const semanticPlanApi = createSemanticPlanApi();
export const readSemanticCatalog = () => semanticPlanApi.readCatalog();
export const readSemanticPlan = (planId: string) =>
  semanticPlanApi.readPlan(planId);
export const createSemanticPlan = (
  name: string,
  formats: SemanticPlanFormats,
) => semanticPlanApi.createPlan(name, formats);
export const renameSemanticPlan = (planId: string, name: string) =>
  semanticPlanApi.renamePlan(planId, name);
export const deleteSemanticPlan = (planId: string) =>
  semanticPlanApi.deletePlan(planId);
