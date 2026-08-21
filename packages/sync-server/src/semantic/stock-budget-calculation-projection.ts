import type { BudgetSnapshot } from '@actual-app/semantic-core';

import { projectStockFreshBudgetCalculations } from './stock-budget-calculations';
import type { StockBudgetCalculationEntities } from './stock-calculation-entities';
import { projectStockCheckingAccountCalculations } from './stock-checking-account-calculations';

export function projectStockBudgetCalculations(
  snapshot: BudgetSnapshot,
): StockBudgetCalculationEntities {
  const accounts = snapshot.entities.filter(
    entity => entity.entityKind === 'be_accounts' && !entity.isTombstone,
  );
  if (accounts.length === 0) {
    return projectStockFreshBudgetCalculations(snapshot);
  }
  return projectStockCheckingAccountCalculations(snapshot);
}
