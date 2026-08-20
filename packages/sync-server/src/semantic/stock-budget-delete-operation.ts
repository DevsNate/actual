import type {
  BudgetVersionReader,
  CatalogReader,
} from '@actual-app/semantic-core';

import type { BudgetLifecycleService } from './budget-lifecycle-service';
import { operationError, parseRequestData } from './stock-operation';
import type {
  StockOperationContext,
  StockOperationResponse,
} from './stock-operation';

export async function handleStockBudgetDelete(
  context: StockOperationContext,
  dependencies: {
    catalogReader: CatalogReader;
    budgetReader: BudgetVersionReader;
    budgetLifecycleService: BudgetLifecycleService;
  },
): Promise<StockOperationResponse> {
  const request = parseRequestData(context.requestData);
  if (
    !request ||
    Object.keys(request).length !== 1 ||
    typeof request.budget_version_id !== 'string' ||
    !request.budget_version_id
  ) {
    return operationError(400, 'invalid_delete_budget_request');
  }
  const catalog = await dependencies.catalogReader.readCatalog(
    context.principal.id,
  );
  const membership = catalog.memberships.find(
    candidate =>
      candidate.principalId === context.principal.id &&
      candidate.budgetVersionId === request.budget_version_id,
  );
  if (!membership) {
    return operationError(403, 'user_does_not_have_write_permissions');
  }
  const snapshot = await dependencies.budgetReader.readBudgetByVersion(
    context.principal.id,
    request.budget_version_id,
  );
  if (!snapshot && !membership.isTombstone) {
    return operationError(403, 'user_does_not_have_write_permissions');
  }
  await dependencies.budgetLifecycleService.deleteBudget({
    principalId: context.principal.id,
    budgetId: membership.budgetId,
    originDeviceId: context.deviceId,
    idempotencyKey: context.clientRequestId,
  });
  return {
    status: 200,
    body: { error: null, shared_user_budget_ids: null },
  };
}
