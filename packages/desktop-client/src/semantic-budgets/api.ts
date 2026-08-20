import { send } from '@actual-app/core/platform/client/connection';
import type {
  SemanticCatalogSnapshot,
  SemanticCreateBudgetResult,
  SemanticBudgetFormats,
  SemanticBudgetLifecycleResult,
  SemanticBudgetSnapshot,
} from '@actual-app/core/server/semantic-budgets/types';
import { v4 as uuidv4 } from 'uuid';

export function createSemanticBudgetApi({
  sendCommand = send,
  allocateCommandId = uuidv4,
}: {
  sendCommand?: typeof send;
  allocateCommandId?: () => string;
} = {}) {
  return {
    readCatalog(): Promise<SemanticCatalogSnapshot> {
      return sendCommand('semantic-budget-catalog');
    },

    readBudget(budgetId: string): Promise<SemanticBudgetSnapshot> {
      return sendCommand('semantic-budget-read', { budgetId });
    },

    createBudget(
      name: string,
      formats: SemanticBudgetFormats,
    ): Promise<SemanticCreateBudgetResult> {
      return sendCommand('semantic-budget-create', {
        name,
        formats,
        idempotencyKey: allocateCommandId(),
      });
    },

    renameBudget(
      budgetId: string,
      name: string,
    ): Promise<SemanticBudgetLifecycleResult> {
      return sendCommand('semantic-budget-rename', {
        budgetId,
        name,
        idempotencyKey: allocateCommandId(),
      });
    },

    deleteBudget(budgetId: string): Promise<SemanticBudgetLifecycleResult> {
      return sendCommand('semantic-budget-delete', {
        budgetId,
        idempotencyKey: allocateCommandId(),
      });
    },
  };
}

const semanticBudgetApi = createSemanticBudgetApi();
export const readSemanticCatalog = () => semanticBudgetApi.readCatalog();
export const readSemanticBudget = (budgetId: string) =>
  semanticBudgetApi.readBudget(budgetId);
export const createSemanticBudget = (
  name: string,
  formats: SemanticBudgetFormats,
) => semanticBudgetApi.createBudget(name, formats);
export const renameSemanticBudget = (budgetId: string, name: string) =>
  semanticBudgetApi.renameBudget(budgetId, name);
export const deleteSemanticBudget = (budgetId: string) =>
  semanticBudgetApi.deleteBudget(budgetId);
