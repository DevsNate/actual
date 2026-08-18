import type { PlanSnapshot } from '@actual-app/semantic-core';

import type { StockFreshPlanCalculations } from './stock-budget-calculations';
import { projectStockFreshPlanCalculations } from './stock-budget-calculations';
import { projectStockCheckingAccountCalculations } from './stock-checking-account-calculations';

export function projectStockBudgetCalculations(
  snapshot: PlanSnapshot,
): StockFreshPlanCalculations {
  const accounts = snapshot.entities.filter(
    entity => entity.entityKind === 'be_accounts' && !entity.isTombstone,
  );
  if (accounts.length === 0) {
    return projectStockFreshPlanCalculations(snapshot);
  }
  return projectStockCheckingAccountCalculations(snapshot);
}
