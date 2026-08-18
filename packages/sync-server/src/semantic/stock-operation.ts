import type { AuthenticatedPrincipal } from '@actual-app/semantic-core';

export const STOCK_API_VERSION = '2026-01-01';
export const STOCK_CATALOG_SCHEMA_VERSION = 16;
export const STOCK_BUDGET_SCHEMA_VERSION = 44;

export type StockOperationResponse = {
  status: number;
  body: Readonly<Record<string, unknown>>;
};

export function operationError(
  status: number,
  id: string,
): StockOperationResponse {
  return { status, body: { error: { id } } };
}

export function parseRequestData(
  value: string,
): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
}

export function nonnegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type StockOperationContext = {
  principal: AuthenticatedPrincipal;
  requestData: string;
  clientRequestId: string;
  deviceId: string;
};
