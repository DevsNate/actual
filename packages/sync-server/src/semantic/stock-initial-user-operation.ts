import type {
  BudgetVersionReader,
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
  budgetReader: BudgetVersionReader;
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
    return {
      status: 200,
      body: initialUserBody(context),
    };
  }

  const budget = await dependencies.budgetReader.readBudgetByVersion(
    context.principal.id,
    membership.budgetVersionId,
  );
  if (!budget || budget.budgetId !== membership.budgetId) {
    return operationError(409, 'initial_budget_unavailable');
  }

  return {
    status: 200,
    body: {
      ...initialUserBody(context),
      user_budget: {
        id: membership.id,
        budget_id: membership.budgetId,
        user_id: membership.principalId,
        permissions: membership.permissions,
        is_tombstone: false,
        last_modified_at: membership.lastModifiedAt,
      },
      budget_version: {
        id: membership.budgetVersionId,
        budget_id: membership.budgetId,
        budget_name: membership.name,
        currency_format: JSON.stringify(budget.currencyFormat),
        date_format: JSON.stringify(budget.dateFormat),
        source: membership.source,
        is_tombstone: false,
      },
    },
  };
}

function initialUserBody(context: StockOperationContext) {
  return {
    error: null,
    session_token: context.sessionToken,
    castle_user_jwt: '',
    helpscout_user_hash: null,
    user_help_access_initial_jwt: '',
    user: projectStockUser(context.principal),
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
