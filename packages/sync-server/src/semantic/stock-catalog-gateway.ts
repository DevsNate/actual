import { AuthenticationError } from '@actual-app/semantic-core';
import type {
  AuthenticatedPrincipal,
  BudgetVersionPlanReader,
  CatalogCommandWriter,
  CatalogReader,
} from '@actual-app/semantic-core';
import express from 'express';

import type { PlanLifecycleService } from './plan-lifecycle-service';
import { handleStockBudgetSync } from './stock-budget-operation';
import type { StockBudgetChangeWriter } from './stock-budget-operation';
import { handleStockCatalogSync } from './stock-catalog-operation';
import { handleStockFamilySync } from './stock-family-operation';
import { handleStockInitialUserData } from './stock-initial-user-operation';
import { operationError, STOCK_API_VERSION } from './stock-operation';
import type { StockOperationResponse } from './stock-operation';
import { handleStockPlanDelete } from './stock-plan-delete-operation';

export type StockCatalogGatewayDependencies = {
  catalogReader: CatalogReader;
  catalogWriter: CatalogCommandWriter;
  planReader: BudgetVersionPlanReader;
  changeWriter: StockBudgetChangeWriter;
  planLifecycleService: PlanLifecycleService;
  resolvePrincipal(sessionToken: string): AuthenticatedPrincipal;
};

export function createStockCatalogGateway(
  dependencies: StockCatalogGatewayDependencies,
): express.Router {
  const handlers = express.Router();
  handlers.use(express.urlencoded({ extended: false, limit: '64kb' }));

  handlers.post('/catalog', async (request, response) => {
    const authentication = authenticate(request, dependencies);
    if ('errorCode' in authentication) {
      send(response, operationError(401, authentication.errorCode));
      return;
    }
    const { principal, sessionToken } = authentication;

    const clientRequestId = request.get('x-ynab-client-request-id');
    if (clientRequestId) {
      response.set('x-ynab-client-request-id', clientRequestId);
    }
    if (request.get('x-ynab-api-version') !== STOCK_API_VERSION) {
      send(response, operationError(400, 'unsupported_api_version'));
      return;
    }
    if (!request.get('x-ynab-device-id') || !clientRequestId) {
      send(response, operationError(400, 'missing_request_context'));
      return;
    }

    const operation = formField(request.body, 'operation_name');
    const requestData = formField(request.body, 'request_data');
    if (!operation || !requestData) {
      send(response, operationError(400, 'invalid_operation_envelope'));
      return;
    }

    try {
      const context = {
        principal,
        sessionToken,
        requestData,
        clientRequestId,
        deviceId: request.get('x-ynab-device-id')!,
      };
      const result =
        operation === 'getInitialUserData'
          ? await handleStockInitialUserData(context, dependencies)
          : operation === 'syncFamilyData'
            ? await handleStockFamilySync(context, dependencies.catalogReader)
            : operation === 'syncCatalogData'
              ? await handleStockCatalogSync(context, {
                  catalogReader: dependencies.catalogReader,
                  catalogWriter: dependencies.catalogWriter,
                  planLifecycleService: dependencies.planLifecycleService,
                })
              : operation === 'syncBudgetData'
                ? await handleStockBudgetSync(context, {
                    planReader: dependencies.planReader,
                    changeWriter: dependencies.changeWriter,
                  })
                : operation === 'deleteBudget'
                  ? await handleStockPlanDelete(context, {
                      catalogReader: dependencies.catalogReader,
                      planReader: dependencies.planReader,
                      planLifecycleService: dependencies.planLifecycleService,
                    })
                  : operationError(501, 'unsupported_operation');
      send(response, result);
    } catch (error) {
      console.error('Stock compatibility projection failed', error);
      send(response, operationError(500, 'stock_projection_unavailable'));
    }
  });

  return handlers;
}

function authenticate(
  request: express.Request,
  dependencies: Pick<StockCatalogGatewayDependencies, 'resolvePrincipal'>,
):
  | { principal: AuthenticatedPrincipal; sessionToken: string }
  | { errorCode: string } {
  const sessionToken = request.get('x-session-token') ?? '';
  try {
    return {
      principal: dependencies.resolvePrincipal(sessionToken),
      sessionToken,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { errorCode: error.code };
    }
    throw error;
  }
}

function formField(body: unknown, name: string): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

function send(response: express.Response, result: StockOperationResponse) {
  response.status(result.status).send(result.body);
}
