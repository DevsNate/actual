import type { BudgetSnapshot } from '@actual-app/semantic-core';

import type { StockFreshBudgetCalculations } from './stock-budget-calculations';
import { projectStockFreshBudgetCalculations } from './stock-budget-calculations';
import { projectStockCheckingAccountCalculations } from './stock-checking-account-calculations';

export function projectStockBudgetCalculations(
  snapshot: BudgetSnapshot,
): StockFreshBudgetCalculations {
  const accounts = snapshot.entities.filter(
    entity => entity.entityKind === 'be_accounts' && !entity.isTombstone,
  );
  if (accounts.length === 0) {
    return projectStockFreshBudgetCalculations(snapshot);
  }
  return projectStockCheckingAccountCalculations(snapshot);
}
