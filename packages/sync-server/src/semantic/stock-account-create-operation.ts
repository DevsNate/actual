export type StockUnlinkedAccountBody = {
  name: string;
  accountType: 'checking' | 'credit-card';
  openingBalance: number;
  openingDate: string;
};

export function parseStockUnlinkedAccountBody(
  value: unknown,
): StockUnlinkedAccountBody | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !['Checking', 'CreditCard'].includes(String(value.type)) ||
    !Number.isSafeInteger(value.balance) ||
    typeof value.starting_balance_date !== 'string' ||
    value.debt_interest_rates !==
      JSON.stringify({
        [value.starting_balance_date.slice(0, 7) + '-01']: 0,
      }) ||
    value.debt_minimum_payments !==
      JSON.stringify({
        [value.starting_balance_date.slice(0, 7) + '-01']: 0,
      }) ||
    value.debt_escrow_amounts !== null ||
    value.paired_sub_category !== null ||
    value.is_migrating_to_debt_account !== false
  ) {
    return null;
  }
  return {
    name: value.name.trim(),
    accountType: value.type === 'CreditCard' ? 'credit-card' : 'checking',
    openingBalance: Number(value.balance),
    openingDate: value.starting_balance_date,
  };
}

export function projectStockCreatedAccount(
  value: Readonly<{
    accountId: string;
    name: string;
    type: 'checking' | 'credit-card';
    openingBalance: number;
  }>,
  stockBudgetId: string,
): Readonly<Record<string, unknown>> {
  return {
    id: value.accountId,
    account_name: value.name,
    account_type: value.type === 'credit-card' ? 'CreditCard' : 'Checking',
    balance_millicents: value.openingBalance,
    budget_id: stockBudgetId,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
