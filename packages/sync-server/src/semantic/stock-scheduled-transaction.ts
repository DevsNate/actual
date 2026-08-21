import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalScheduledTransaction,
  CanonicalScheduledTransactionMutation,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';
import {
  projectStockRequestEntity,
  projectStockResponseEntity,
} from './stock-budget-projection';
import { isRecord } from './stock-operation';

const PARENT_KEYS = [
  'amount',
  'date',
  'debt_transaction_type',
  'entities_account_id',
  'entities_payee_id',
  'entities_subcategory_id',
  'flag',
  'frequency',
  'id',
  'is_tombstone',
  'memo',
  'transfer_account_id',
  'upcoming_instances',
] as const;

const TRANSACTION_KEYS = [
  'accepted',
  'amount',
  'cash_amount',
  'check_number',
  'cleared',
  'credit_amount',
  'credit_amount_adjusted',
  'date',
  'date_entered_from_schedule',
  'debt_transaction_type',
  'entities_account_id',
  'entities_payee_id',
  'entities_scheduled_transaction_id',
  'entities_subcategory_id',
  'flag',
  'id',
  'imported_date',
  'imported_payee',
  'is_tombstone',
  'matched_transaction_id',
  'memo',
  'original_imported_payee',
  'provider_cleansed_payee',
  'source',
  'subcategory_credit_amount_preceding',
  'transfer_account_id',
  'transfer_subtransaction_id',
  'transfer_transaction_id',
  'ynab_id',
] as const;

type StockScheduledTransactionMutation = {
  mutation: CanonicalScheduledTransactionMutation;
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: number;
  serverKnowledgeAdvance: 2;
};

export function parseStockScheduledTransactionMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockScheduledTransactionMutation | null {
  const keys = Object.keys(changedEntities).sort();
  if (
    !isDeepStrictEqual(keys, ['be_scheduled_transaction_groups']) &&
    !isDeepStrictEqual(keys, [
      'be_payees',
      'be_scheduled_transaction_groups',
    ]) &&
    !isDeepStrictEqual(keys, [
      'be_scheduled_transaction_groups',
      'be_transaction_groups',
    ])
  ) {
    return null;
  }
  const group = exactlyOneRecord(
    changedEntities.be_scheduled_transaction_groups,
  );
  const row =
    group && isRecord(group.be_scheduled_transaction)
      ? group.be_scheduled_transaction
      : null;
  if (
    !group ||
    !row ||
    group.id !== row.id ||
    group.be_scheduled_subtransactions !== null ||
    !hasExactKeys(row, PARENT_KEYS) ||
    typeof row.id !== 'string'
  ) {
    return null;
  }

  const current = entity(snapshot, 'be_scheduled_transactions', row.id);
  if (!current) return parseCreate(changedEntities, row, snapshot);
  return parseExisting(changedEntities, row, current, snapshot);
}

function parseCreate(
  changedEntities: Record<string, unknown>,
  row: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockScheduledTransactionMutation | null {
  const payeeRow = exactlyOneRecord(changedEntities.be_payees);
  if (
    !payeeRow ||
    row.is_tombstone !== false ||
    snapshot.entities.some(item => item.entityId === row.id) ||
    !validParentRow(row, snapshot) ||
    typeof payeeRow.id !== 'string' ||
    payeeRow.id !== row.entities_payee_id
  ) {
    return null;
  }
  const currentPayee = live(snapshot, 'be_payees', payeeRow.id);
  if (!currentPayee) return null;
  const expectedPayee = projectStockRequestEntity(currentPayee);
  const payeeDiff = changedKeys(expectedPayee, payeeRow);
  if (
    !hasSameKeys(expectedPayee, payeeRow) ||
    !isDeepStrictEqual(payeeDiff, ['auto_fill_subcategory_id']) ||
    payeeRow.auto_fill_subcategory_id !== row.entities_subcategory_id ||
    payeeRow.auto_fill_subcategory_enabled !== true
  ) {
    return null;
  }

  const parent = parentEntity(snapshot, row);
  const categoryId = requireString(row.entities_subcategory_id);
  const payee = {
    ...currentPayee,
    payload: {
      ...currentPayee.payload,
      autoFillSubCategoryId: categoryId,
    },
  };
  const after = appendOrReplace(snapshot, [payee, parent]);
  return {
    mutation: {
      kind: 'create',
      parent: canonicalParent(snapshot.budgetId, parent),
      payeeAutofill: {
        payeeId: currentPayee.entityId,
        expectedCategoryId: optionalString(
          currentPayee.payload.autoFillSubCategoryId,
        ),
        categoryId,
      },
    },
    changes: [payee, parent],
    changedEntities: responseDelta(snapshot, after, parent),
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: 2,
  };
}

function parseExisting(
  changedEntities: Record<string, unknown>,
  row: Record<string, unknown>,
  current: BudgetEntity,
  snapshot: BudgetSnapshot,
): StockScheduledTransactionMutation | null {
  if (current.isTombstone || !validParentRow(row, snapshot)) return null;
  const expected = projectStockRequestEntity(current);
  const diff = changedKeys(expected, row);

  if (
    row.is_tombstone === true &&
    isDeepStrictEqual(diff, ['is_tombstone']) &&
    Object.keys(changedEntities).length === 1
  ) {
    const tombstone = { ...current, isTombstone: true };
    const after = appendOrReplace(snapshot, [tombstone]);
    return {
      mutation: {
        kind: 'delete',
        budgetId: snapshot.budgetId,
        scheduledTransactionId: current.entityId,
      },
      changes: [tombstone],
      changedEntities: responseDelta(snapshot, after, null),
      expectedDeviceAdvance: 1,
      serverKnowledgeAdvance: 2,
    };
  }
  if (row.is_tombstone !== false) return null;

  const updated = parentEntity(snapshot, row);
  const transactionGroup = exactlyOneRecord(
    changedEntities.be_transaction_groups,
  );
  if (transactionGroup) {
    const occurrenceRow = isRecord(transactionGroup.be_transaction)
      ? transactionGroup.be_transaction
      : null;
    if (
      !occurrenceRow ||
      transactionGroup.id !== occurrenceRow.id ||
      transactionGroup.be_subtransactions !== null ||
      !validOccurrenceRow(occurrenceRow, updated, snapshot)
    ) {
      return null;
    }
    const occurrence = occurrenceEntity(snapshot, occurrenceRow);
    if (snapshot.entities.some(item => item.entityId === occurrence.entityId)) {
      return null;
    }
    const after = appendOrReplace(snapshot, [updated, occurrence]);
    return {
      mutation: {
        kind: 'materialize',
        parent: canonicalParent(snapshot.budgetId, updated),
        occurrence: {
          id: occurrence.entityId,
          budgetId: snapshot.budgetId,
          scheduledTransactionId: requireString(
            occurrence.payload.scheduledTransactionId,
          ),
          accountId: requireString(occurrence.payload.accountId),
          payeeId: requireString(occurrence.payload.payeeId),
          categoryId: requireString(occurrence.payload.subCategoryId),
          date: requireDate(occurrence.payload.date),
          dateEnteredFromSchedule: requireDate(
            occurrence.payload.dateEnteredFromSchedule,
          ),
          amount: requireInteger(occurrence.payload.amount),
          memo: optionalString(occurrence.payload.memo),
          cleared: 'Uncleared',
          accepted: false,
          source: 'Scheduler',
        },
      },
      changes: [updated, occurrence],
      changedEntities: responseDelta(snapshot, after, updated, occurrence),
      expectedDeviceAdvance: 5,
      serverKnowledgeAdvance: 2,
    };
  }

  if (Object.keys(changedEntities).length !== 1) return null;
  const allowedEdit = isDeepStrictEqual(diff, ['amount', 'memo']);
  const allowedRedate =
    diff.includes('date') &&
    diff.includes('upcoming_instances') &&
    diff.every(key => key === 'date' || key === 'upcoming_instances');
  if (!allowedEdit && !allowedRedate) return null;
  const after = appendOrReplace(snapshot, [updated]);
  return {
    mutation: {
      kind: 'update',
      parent: canonicalParent(snapshot.budgetId, updated),
    },
    changes: [updated],
    changedEntities: responseDelta(snapshot, after, updated),
    expectedDeviceAdvance: allowedEdit ? 2 : 3,
    serverKnowledgeAdvance: 2,
  };
}

function validParentRow(
  row: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): boolean {
  const upcoming = parseUpcoming(row.upcoming_instances);
  return (
    typeof row.id === 'string' &&
    live(snapshot, 'be_accounts', row.entities_account_id) !== undefined &&
    live(snapshot, 'be_payees', row.entities_payee_id) !== undefined &&
    live(snapshot, 'be_subcategories', row.entities_subcategory_id) !==
      undefined &&
    requireDateOrNull(row.date) !== null &&
    row.frequency === 'Monthly' &&
    Number.isSafeInteger(row.amount) &&
    Number(row.amount) !== 0 &&
    (row.memo === null || typeof row.memo === 'string') &&
    row.flag === null &&
    row.transfer_account_id === null &&
    upcoming !== null &&
    row.debt_transaction_type === null
  );
}

function validOccurrenceRow(
  row: Record<string, unknown>,
  parent: BudgetEntity,
  snapshot: BudgetSnapshot,
): boolean {
  if (!hasExactKeys(row, TRANSACTION_KEYS)) return false;
  const date = requireDateOrNull(row.date);
  return (
    date !== null &&
    row.id === `${parent.entityId}_${date}` &&
    row.is_tombstone === false &&
    row.entities_scheduled_transaction_id === parent.entityId &&
    row.entities_account_id === parent.payload.accountId &&
    row.entities_payee_id === parent.payload.payeeId &&
    row.entities_subcategory_id === parent.payload.subCategoryId &&
    row.date_entered_from_schedule === date &&
    row.amount === parent.payload.amount &&
    row.cash_amount === 0 &&
    row.credit_amount === 0 &&
    row.credit_amount_adjusted === 0 &&
    row.subcategory_credit_amount_preceding === 0 &&
    row.memo === parent.payload.memo &&
    row.cleared === 'Uncleared' &&
    row.accepted === false &&
    row.source === 'Scheduler' &&
    row.transfer_account_id === null &&
    row.transfer_transaction_id === null &&
    row.transfer_subtransaction_id === null &&
    row.matched_transaction_id === null &&
    row.check_number === null &&
    row.flag === null &&
    row.ynab_id === null &&
    row.imported_payee === null &&
    row.imported_date === null &&
    row.original_imported_payee === null &&
    row.provider_cleansed_payee === null &&
    row.debt_transaction_type === null &&
    !snapshot.entities.some(item => item.entityId === row.id)
  );
}

function parentEntity(
  snapshot: BudgetSnapshot,
  row: Record<string, unknown>,
): BudgetEntity {
  return {
    entityKind: 'be_scheduled_transactions',
    entityId: requireString(row.id),
    isTombstone: row.is_tombstone === true,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      accountId: row.entities_account_id,
      payeeId: row.entities_payee_id,
      subCategoryId: row.entities_subcategory_id,
      date: row.date,
      frequency: row.frequency,
      amount: row.amount,
      memo: row.memo,
      flag: row.flag,
      transferAccountId: row.transfer_account_id,
      upcomingInstances: parseUpcoming(row.upcoming_instances),
      debtTransactionType: row.debt_transaction_type,
    },
  };
}

function occurrenceEntity(
  snapshot: BudgetSnapshot,
  row: Record<string, unknown>,
): BudgetEntity {
  const amount = requireInteger(row.amount);
  return {
    entityKind: 'be_transactions',
    entityId: requireString(row.id),
    isTombstone: false,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      accountId: row.entities_account_id,
      payeeId: row.entities_payee_id,
      subCategoryId: row.entities_subcategory_id,
      scheduledTransactionId: row.entities_scheduled_transaction_id,
      date: row.date,
      dateEnteredFromSchedule: row.date_entered_from_schedule,
      amount,
      cashAmount: amount,
      creditAmount: 0,
      creditAmountAdjusted: 0,
      subcategoryCreditAmountPreceding: 0,
      memo: row.memo,
      cleared: 'Uncleared',
      accepted: false,
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
      source: 'Scheduler',
      debtTransactionType: null,
    },
  };
}

function canonicalParent(
  budgetId: string,
  entity: BudgetEntity,
): CanonicalScheduledTransaction {
  const upcoming = entity.payload.upcomingInstances;
  if (!Array.isArray(upcoming) || upcoming.length !== 1) {
    throw new Error('Captured schedule requires one upcoming date');
  }
  return {
    id: entity.entityId,
    budgetId,
    accountId: requireString(entity.payload.accountId),
    payeeId: requireString(entity.payload.payeeId),
    categoryId: requireString(entity.payload.subCategoryId),
    date: requireDate(entity.payload.date),
    frequency: 'Monthly',
    amount: requireInteger(entity.payload.amount),
    memo: optionalString(entity.payload.memo),
    upcomingInstances: [requireDate(upcoming[0])],
  };
}

function responseDelta(
  before: BudgetSnapshot,
  after: BudgetSnapshot,
  parent: BudgetEntity | null,
  occurrence?: BudgetEntity,
): Record<string, unknown> {
  return {
    ...buildStockBudgetEmptyDelta(before),
    ...calculationDelta(before, after),
    be_scheduled_transactions: parent
      ? [projectStockResponseEntity(parent)]
      : [],
    ...(occurrence
      ? { be_transactions: [projectStockResponseEntity(occurrence)] }
      : {}),
  };
}

function calculationDelta(before: BudgetSnapshot, after: BudgetSnapshot) {
  const left = projectStockBudgetCalculations(before);
  const right = projectStockBudgetCalculations(after);
  return Object.fromEntries(
    CALCULATION_KEYS.map(key => {
      const prior = left[key];
      const next = right[key];
      return [key, isDeepStrictEqual(prior, next) ? [] : next];
    }),
  );
}

const CALCULATION_KEYS = [
  'be_monthly_budget_calculations',
  'be_monthly_subcategory_budget_calculations',
  'be_account_calculations',
  'be_monthly_account_calculations',
] as const;

function appendOrReplace(
  snapshot: BudgetSnapshot,
  replacements: readonly BudgetEntity[],
): BudgetSnapshot {
  const keys = new Set(
    replacements.map(item => `${item.entityKind}\0${item.entityId}`),
  );
  return {
    ...snapshot,
    entities: [
      ...snapshot.entities.filter(
        item => !keys.has(`${item.entityKind}\0${item.entityId}`),
      ),
      ...replacements,
    ],
  };
}

function parseUpcoming(value: unknown): readonly [string] | null {
  const match =
    typeof value === 'string' ? /^\{(\d{4}-\d{2}-\d{2})\}$/u.exec(value) : null;
  return match && requireDateOrNull(match[1]) !== null ? [match[1]] : null;
}

function entity(snapshot: BudgetSnapshot, kind: string, id: string) {
  return snapshot.entities.find(
    item => item.entityKind === kind && item.entityId === id,
  );
}

function live(snapshot: BudgetSnapshot, kind: string, id: unknown) {
  return typeof id === 'string'
    ? snapshot.entities.find(
        item =>
          item.entityKind === kind && item.entityId === id && !item.isTombstone,
      )
    : undefined;
}

function exactlyOneRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value.length === 1 && isRecord(value[0])
    ? value[0]
    : null;
}

function hasExactKeys(row: Record<string, unknown>, keys: readonly string[]) {
  return isDeepStrictEqual(Object.keys(row).sort(), [...keys].sort());
}

function hasSameKeys(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  return isDeepStrictEqual(Object.keys(left).sort(), Object.keys(right).sort());
}

function changedKeys(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  if (!hasSameKeys(left, right)) return ['__shape__'];
  return Object.keys(left)
    .filter(key => !isDeepStrictEqual(left[key], right[key]))
    .sort();
}

function requireDateOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? value
    : null;
}

function requireDate(value: unknown): string {
  const date = requireDateOrNull(value);
  if (!date) throw new Error('Captured schedule date is unavailable');
  return date;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new Error('Captured schedule identity is unavailable');
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null) return null;
  return requireString(value);
}

function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Captured schedule amount is unavailable');
  }
  return Number(value);
}
