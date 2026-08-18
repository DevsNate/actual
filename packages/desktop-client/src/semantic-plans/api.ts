import { send } from '@actual-app/core/platform/client/connection';
import type {
  SemanticCatalogSnapshot,
  SemanticCreatePlanResult,
  SemanticPlanFormats,
  SemanticPlanLifecycleResult,
  SemanticPlanSnapshot,
} from '@actual-app/core/server/semantic-plans/types';
import { v4 as uuidv4 } from 'uuid';

export function readSemanticCatalog(): Promise<SemanticCatalogSnapshot> {
  return send('semantic-plan-catalog');
}

export function readSemanticPlan(
  planId: string,
): Promise<SemanticPlanSnapshot> {
  return send('semantic-plan-read', { planId });
}

export function createSemanticPlan(
  name: string,
  formats: SemanticPlanFormats,
): Promise<SemanticCreatePlanResult> {
  return send('semantic-plan-create', {
    name,
    formats,
    idempotencyKey: uuidv4(),
  });
}

export function renameSemanticPlan(
  planId: string,
  name: string,
): Promise<SemanticPlanLifecycleResult> {
  return send('semantic-plan-rename', {
    planId,
    name,
    idempotencyKey: uuidv4(),
  });
}

export function deleteSemanticPlan(
  planId: string,
): Promise<SemanticPlanLifecycleResult> {
  return send('semantic-plan-delete', {
    planId,
    idempotencyKey: uuidv4(),
  });
}
