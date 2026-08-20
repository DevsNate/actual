import type {
  BudgetVersionPlanReader,
  CatalogReader,
} from '@actual-app/semantic-core';

import { isRecord, operationError, parseRequestData } from './stock-operation';
import type {
  StockOperationContext,
  StockOperationResponse,
} from './stock-operation';
import { projectStockUser } from './stock-user-projection';

type Dependencies = {
  catalogReader: CatalogReader;
  planReader: BudgetVersionPlanReader;
};

export async function handleStockInitialUserData(
  context: StockOperationContext,
  dependencies: Dependencies,
): Promise<StockOperationResponse> {
  if (!isInitialUserRequest(context.requestData)) {
    return operationError(400, 'invalid_initial_user_request');
  }

  const catalog = await dependencies.catalogReader.readCatalog(
    context.principal.id,
  );
  const membership = catalog.memberships
    .filter(
      candidate =>
        candidate.principalId === context.principal.id &&
        !candidate.isTombstone,
    )
    .sort(
      (left, right) =>
        right.lastModifiedAt.localeCompare(left.lastModifiedAt) ||
        left.id.localeCompare(right.id),
    )[0];
  if (!membership) {
    return operationError(409, 'initial_budget_unavailable');
  }

  const plan = await dependencies.planReader.readPlanByBudgetVersion(
    context.principal.id,
    membership.budgetVersionId,
  );
  if (!plan || plan.planId !== membership.planId) {
    return operationError(409, 'initial_budget_unavailable');
  }

  return {
    status: 200,
    body: {
      error: null,
      session_token: context.sessionToken,
      castle_user_jwt: '',
      helpscout_user_hash: null,
      user_help_access_initial_jwt: '',
      user: projectStockUser(context.principal),
      user_budget: {
        id: membership.id,
        budget_id: membership.planId,
        user_id: membership.principalId,
        permissions: membership.permissions,
        is_tombstone: false,
        last_modified_at: membership.lastModifiedAt,
      },
      budget_version: {
        id: membership.budgetVersionId,
        budget_id: membership.planId,
        budget_name: membership.name,
        currency_format: JSON.stringify(plan.currencyFormat),
        date_format: JSON.stringify(plan.dateFormat),
        source: membership.source,
        is_tombstone: false,
      },
    },
  };
}

function isInitialUserRequest(value: string): boolean {
  const request = parseRequestData(value);
  if (!request || !isRecord(request.device_info)) {
    return false;
  }
  return (
    nonEmptyString(request.device_info.id) &&
    nonEmptyString(request.device_info.device_os)
  );
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
