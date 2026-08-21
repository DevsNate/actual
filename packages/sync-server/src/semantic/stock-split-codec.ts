import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetEntity,
  BudgetSnapshot,
  CanonicalOrdinaryPayee,
} from '@actual-app/semantic-core';

import {
  normalizeCapturedCheckingSubtransactionAmounts,
  normalizeCapturedCheckingTransactionAmounts,
} from './stock-transaction-normalization';

export function parentEntity(
  snapshot: BudgetSnapshot,
  row: Record<string, unknown>,
): BudgetEntity {
  const amounts = normalizeCapturedCheckingTransactionAmounts(row.amount);
  return {
    entityKind: 'be_transactions',
    entityId: requireString(row.id),
    isTombstone: row.is_tombstone === true,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      accountId: row.entities_account_id,
      payeeId: row.entities_payee_id,
      subCategoryId: row.entities_subcategory_id,
      scheduledTransactionId: null,
      date: row.date,
      dateEnteredFromSchedule: null,
      ...amounts,
      memo: row.memo ?? null,
      cleared: row.cleared,
      accepted: row.accepted,
      checkNumber: null,
      flag: null,
      transferAccountId: null,
      transferTransactionId: null,
      transferSubtransactionId: null,
      matchedTransactionId: null,
      ynabId: null,
      importedPayee: null,
      importedDate: null,
      originalImportedPayee: null,
      providerCleansedPayee: null,
      source: null,
      debtTransactionType: null,
    },
  };
}

export function lineEntity(
  snapshot: BudgetSnapshot,
  row: Record<string, unknown>,
): BudgetEntity {
  const amounts = normalizeCapturedCheckingSubtransactionAmounts(row.amount);
  return {
    entityKind: 'be_subtransactions',
    entityId: requireString(row.id),
    isTombstone: row.is_tombstone === true,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      transactionId: row.entities_transaction_id,
      payeeId: row.entities_payee_id,
      subCategoryId: row.entities_subcategory_id,
      ...amounts,
      memo: row.memo ?? null,
      transferAccountId: null,
      transferTransactionId: null,
      sortableIndex: row.sortable_index,
    },
  };
}

export function payeeEntity(
  snapshot: BudgetSnapshot,
  row: Record<string, unknown>,
): BudgetEntity {
  const payee = payeeFromRow(snapshot.budgetId, row);
  return {
    entityKind: 'be_payees',
    entityId: payee.id,
    isTombstone: false,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      accountId: null,
      enabled: true,
      autoFillSubCategoryId: null,
      autoFillUserDefinedSubcategoryId: null,
      autoFillMemo: null,
      autoFillAmount: 0,
      autoFillSubCategoryEnabled: true,
      autoFillMemoEnabled: false,
      autoFillAmountEnabled: false,
      renameOnImportEnabled: true,
      name: payee.name,
      internalName: null,
      deviceKnowledge: null,
    },
  };
}

export function payeeFromRow(
  budgetId: string,
  row: Record<string, unknown>,
): CanonicalOrdinaryPayee {
  return {
    id: requireString(row.id),
    budgetId,
    name: requireString(row.name).trim(),
    isEnabled: true,
    autoFillCategoryId: null,
    autoFillUserDefinedCategoryId: null,
    autoFillMemo: null,
    autoFillAmount: 0,
    autoFillCategoryEnabled: true,
    autoFillMemoEnabled: false,
    autoFillAmountEnabled: false,
    renameOnImportEnabled: true,
    internalName: null,
  };
}

export function validParentShape(row: Record<string, unknown>): boolean {
  const allowed = new Set([
    'id',
    'is_tombstone',
    'entities_account_id',
    'entities_payee_id',
    'entities_subcategory_id',
    'date',
    'amount',
    'cash_amount',
    'credit_amount',
    'memo',
    'cleared',
    'accepted',
    'transfer_account_id',
    'transfer_transaction_id',
  ]);
  return (
    Object.keys(row).every(key => allowed.has(key)) &&
    typeof row.id === 'string' &&
    typeof row.entities_account_id === 'string' &&
    (row.entities_payee_id === null ||
      typeof row.entities_payee_id === 'string') &&
    typeof row.entities_subcategory_id === 'string' &&
    requireDateOrNull(row.date) !== null &&
    Number.isSafeInteger(row.amount) &&
    row.amount !== 0 &&
    (row.cash_amount === 0 || row.cash_amount === row.amount) &&
    row.credit_amount === 0 &&
    (row.memo === null || typeof row.memo === 'string') &&
    row.cleared === 'Uncleared' &&
    row.accepted === true &&
    (row.transfer_account_id === undefined ||
      row.transfer_account_id === null) &&
    (row.transfer_transaction_id === undefined ||
      row.transfer_transaction_id === null)
  );
}

export function validLineShape(
  row: Record<string, unknown>,
  parentId: unknown,
  index: number,
): boolean {
  const allowed = new Set([
    'id',
    'is_tombstone',
    'entities_transaction_id',
    'entities_payee_id',
    'entities_subcategory_id',
    'amount',
    'cash_amount',
    'credit_amount',
    'memo',
    'sortable_index',
    'transfer_account_id',
    'transfer_transaction_id',
  ]);
  return (
    Object.keys(row).every(key => allowed.has(key)) &&
    typeof row.id === 'string' &&
    row.entities_transaction_id === parentId &&
    (row.entities_payee_id === null ||
      typeof row.entities_payee_id === 'string') &&
    typeof row.entities_subcategory_id === 'string' &&
    Number.isSafeInteger(row.amount) &&
    (row.cash_amount === 0 || row.cash_amount === row.amount) &&
    row.credit_amount === 0 &&
    (row.memo === undefined ||
      row.memo === null ||
      typeof row.memo === 'string') &&
    row.sortable_index === index &&
    (row.transfer_account_id === undefined ||
      row.transfer_account_id === null) &&
    (row.transfer_transaction_id === undefined ||
      row.transfer_transaction_id === null)
  );
}

export function validNewPayee(row: Record<string, unknown>): boolean {
  const allowed = new Set([
    'id',
    'is_tombstone',
    'entities_account_id',
    'enabled',
    'name',
    'auto_fill_amount',
    'rename_on_import_enabled',
  ]);
  return (
    Object.keys(row).every(key => allowed.has(key)) &&
    typeof row.id === 'string' &&
    row.is_tombstone === false &&
    row.entities_account_id === null &&
    row.enabled === true &&
    typeof row.name === 'string' &&
    row.name.trim().length > 0 &&
    row.auto_fill_amount === 0 &&
    row.rename_on_import_enabled === true
  );
}

export function semanticChangedKeys(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): string[] {
  return Object.keys(actual).filter(
    key => !isDeepStrictEqual(expected[key], actual[key]),
  );
}

export function requireString(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new Error('Expected string');
  }
  return value;
}

export function optionalString(value: unknown): string | null {
  return value === null ? null : requireString(value);
}

export function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Expected integer');
  }
  return Number(value);
}

export function requireDate(value: unknown): string {
  const date = requireDateOrNull(value);
  if (!date) {
    throw new Error('Expected date');
  }
  return date;
}

function requireDateOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? value
    : null;
}

export function requireCleared(
  value: unknown,
): 'Uncleared' | 'Cleared' | 'Reconciled' {
  if (value === 'Uncleared' || value === 'Cleared' || value === 'Reconciled') {
    return value;
  }
  throw new Error('Expected cleared');
}
