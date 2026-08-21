import type {
  BudgetChangeSetCommand,
  BudgetSnapshot,
} from '@actual-app/semantic-core';

import { projectStockRequestEntity } from './stock-budget-projection';
import { isRecord } from './stock-operation';

export function parseStockAccountRenameDelta(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockAccountRename | null {
  if (!hasExactKeys(changedEntities, ['be_accounts', 'be_payees'])) {
    return null;
  }
  const accountRows = changedEntities.be_accounts;
  const payeeRows = changedEntities.be_payees;
  if (
    !Array.isArray(accountRows) ||
    accountRows.length !== 1 ||
    !isRecord(accountRows[0]) ||
    !Array.isArray(payeeRows) ||
    payeeRows.length !== 1 ||
    !isRecord(payeeRows[0])
  ) {
    return null;
  }
  const accountRow = accountRows[0];
  const payeeRow = payeeRows[0];
  if (
    typeof accountRow.id !== 'string' ||
    typeof payeeRow.id !== 'string' ||
    typeof accountRow.account_name !== 'string' ||
    !accountRow.account_name.trim()
  ) {
    return null;
  }

  const account = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_accounts' && entity.entityId === accountRow.id,
  );
  const payee = snapshot.entities.find(
    entity =>
      entity.entityKind === 'be_payees' && entity.entityId === payeeRow.id,
  );
  if (
    !account ||
    !payee ||
    account.isTombstone ||
    payee.isTombstone ||
    payee.payload.accountId !== account.entityId ||
    account.payload.accountType !== 'Checking'
  ) {
    return null;
  }
  const newName = accountRow.account_name.trim();
  if (
    newName === account.payload.accountName ||
    payeeRow.name !== `Transfer : ${newName}`
  ) {
    return null;
  }
  const expectedAccount = {
    ...projectStockRequestEntity(account),
    account_name: newName,
  };
  const expectedPayee = {
    ...projectStockRequestEntity(payee),
    name: `Transfer : ${newName}`,
  };
  if (
    !sameRecord(accountRow, expectedAccount) ||
    !sameRecord(payeeRow, expectedPayee)
  ) {
    return null;
  }

  return {
    rename: {
      budgetId: snapshot.budgetId,
      accountId: account.entityId,
      transferPayeeId: payee.entityId,
      expectedAccountName: String(account.payload.accountName),
      expectedTransferPayeeName: String(payee.payload.name),
      name: newName,
    },
    changes: [
      {
        ...account,
        payload: { ...account.payload, accountName: newName },
      },
      {
        ...payee,
        payload: { ...payee.payload, name: `Transfer : ${newName}` },
      },
    ],
  };
}

export type StockAccountRename = {
  rename: {
    budgetId: string;
    accountId: string;
    transferPayeeId: string;
    expectedAccountName: string;
    expectedTransferPayeeName: string;
    name: string;
  };
  changes: BudgetChangeSetCommand['changes'];
};

function sameRecord(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  return JSON.stringify(sortRecord(left)) === JSON.stringify(sortRecord(right));
}

function sortRecord(value: Readonly<Record<string, unknown>>): unknown {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, isRecord(item) ? sortRecord(item) : item]),
  );
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
