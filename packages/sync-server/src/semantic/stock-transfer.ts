import { isDeepStrictEqual } from 'node:util';

import type {
  BudgetChangeSetCommand,
  BudgetEntity,
  BudgetSnapshot,
  CanonicalTransferLeg,
  CanonicalTransferMutation,
} from '@actual-app/semantic-core';

import { buildStockBudgetEmptyDelta } from './stock-budget-bootstrap';
import { projectStockBudgetCalculations } from './stock-budget-calculation-projection';
import { projectStockEntity } from './stock-budget-projection';
import { isRecord } from './stock-operation';
import { normalizeCapturedReciprocalTransferAmounts } from './stock-transaction-normalization';

const TRANSFER_KEYS = new Set([
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
]);

export type StockTransferMutation = {
  mutation: CanonicalTransferMutation;
  changes: BudgetChangeSetCommand['changes'];
  changedEntities: Readonly<Record<string, unknown>>;
  expectedDeviceAdvance: number;
  serverKnowledgeAdvance: 1 | 2;
};

export function parseStockTransferMutation(
  changedEntities: Record<string, unknown>,
  snapshot: BudgetSnapshot,
): StockTransferMutation | null {
  if (
    !isDeepStrictEqual(Object.keys(changedEntities), ['be_transaction_groups'])
  ) {
    return null;
  }
  const groups = changedEntities.be_transaction_groups;
  if (!Array.isArray(groups) || groups.length !== 2) return null;
  const rows = groups.map(group => {
    if (!isRecord(group) || !isRecord(group.be_transaction)) return null;
    if (
      group.id !== group.be_transaction.id ||
      group.be_subtransactions !== null
    ) {
      return null;
    }
    return group.be_transaction;
  });
  if (!rows[0] || !rows[1]) return null;
  const pair: Pair<Record<string, unknown>> = [rows[0], rows[1]];

  const current = pair.map(row =>
    entity(snapshot, 'be_transactions', string(row.id)),
  ) as [BudgetEntity | undefined, BudgetEntity | undefined];
  if (current.every(item => item === undefined)) {
    return parseCreate(pair, snapshot);
  }
  if (current.some(item => !item)) return null;
  return parseExisting(pair, [current[0]!, current[1]!], snapshot);
}

function parseCreate(
  rows: Pair<Record<string, unknown>>,
  snapshot: BudgetSnapshot,
): StockTransferMutation | null {
  if (!validPair(rows, snapshot, false)) return null;
  const entities: Pair<BudgetEntity> = [
    transferEntity(snapshot, rows[0]),
    transferEntity(snapshot, rows[1]),
  ];
  const after = { ...snapshot, entities: [...snapshot.entities, ...entities] };
  return {
    mutation: {
      kind: 'create',
      legs: canonicalPair(entities, snapshot.budgetId),
    },
    changes: entities,
    changedEntities: {
      ...buildStockBudgetEmptyDelta(snapshot),
      ...calculationDelta(snapshot, after),
      be_transactions: entities.map(projectStockEntity),
    },
    expectedDeviceAdvance: 8,
    serverKnowledgeAdvance: 2,
  };
}

function parseExisting(
  rows: Pair<Record<string, unknown>>,
  current: Pair<BudgetEntity>,
  snapshot: BudgetSnapshot,
): StockTransferMutation | null {
  if (!current.every(isLiveTransferEntity) || !currentPair(current)) {
    return null;
  }
  if (rows.every(row => row.is_tombstone === true)) {
    if (!validDeletion(rows, current)) return null;
    const tombstones: Pair<BudgetEntity> = [
      tombstone(current[0]),
      tombstone(current[1]),
    ];
    return {
      mutation: {
        kind: 'delete',
        budgetId: snapshot.budgetId,
        transactionIds: [current[0].entityId, current[1].entityId],
      },
      changes: tombstones,
      changedEntities: {
        ...buildStockBudgetEmptyDelta(snapshot),
        ...calculationDelta(snapshot, replace(snapshot, tombstones)),
      },
      expectedDeviceAdvance: 8,
      serverKnowledgeAdvance: 2,
    };
  }

  if (!validPair(rows, snapshot, true)) return null;
  const entities: Pair<BudgetEntity> = [
    transferEntity(snapshot, rows[0]),
    transferEntity(snapshot, rows[1]),
  ];
  const changed = entities.filter(
    (item, index) =>
      !isDeepStrictEqual(
        projectStockEntity(item),
        projectStockEntity(current[index]),
      ),
  );
  const isAmountUpdate = sameExcept(current, entities, [
    'amount',
    'cashAmount',
  ]);
  const isMemoUpdate = sameExcept(current, entities, ['memo']);
  if (changed.length !== 2 || (!isAmountUpdate && !isMemoUpdate)) {
    return null;
  }
  return {
    mutation: {
      kind: 'update',
      budgetId: snapshot.budgetId,
      legs: canonicalPair(entities, snapshot.budgetId),
    },
    changes: entities,
    changedEntities: {
      ...buildStockBudgetEmptyDelta(snapshot),
      ...calculationDelta(snapshot, replace(snapshot, entities)),
      be_transactions: entities.map(projectStockEntity),
    },
    expectedDeviceAdvance: 2,
    serverKnowledgeAdvance: isAmountUpdate ? 2 : 1,
  };
}

function validPair(
  rows: Pair<Record<string, unknown>>,
  snapshot: BudgetSnapshot,
  existing: boolean,
): boolean {
  const [left, right] = rows;
  return (
    rows.every(row => validLeg(row)) &&
    left.id !== right.id &&
    left.entities_account_id !== right.entities_account_id &&
    left.transfer_account_id === right.entities_account_id &&
    right.transfer_account_id === left.entities_account_id &&
    left.transfer_transaction_id === right.id &&
    right.transfer_transaction_id === left.id &&
    left.amount === -Number(right.amount) &&
    left.amount !== 0 &&
    left.date === right.date &&
    left.memo === right.memo &&
    rows.every(row => live(snapshot, 'be_accounts', row.entities_account_id)) &&
    rows.every(row => {
      const payee = live(snapshot, 'be_payees', row.entities_payee_id);
      return payee?.payload.accountId === row.transfer_account_id;
    }) &&
    (existing ||
      rows.every(row => !entity(snapshot, 'be_transactions', string(row.id))))
  );
}

function validLeg(row: Record<string, unknown>): boolean {
  return (
    Object.keys(row).every(key => TRANSFER_KEYS.has(key)) &&
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    row.is_tombstone === false &&
    typeof row.entities_account_id === 'string' &&
    typeof row.entities_payee_id === 'string' &&
    row.entities_subcategory_id === null &&
    typeof row.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(row.date) &&
    Number.isSafeInteger(row.amount) &&
    Number.isSafeInteger(row.cash_amount) &&
    typeof row.transfer_account_id === 'string' &&
    typeof row.transfer_transaction_id === 'string' &&
    (row.memo === null || typeof row.memo === 'string') &&
    ['Uncleared', 'Cleared', 'Reconciled'].includes(String(row.cleared)) &&
    typeof row.accepted === 'boolean' &&
    (row.entities_scheduled_transaction_id ?? null) === null &&
    (row.transfer_subtransaction_id ?? null) === null &&
    (row.matched_transaction_id ?? null) === null
  );
}

function validDeletion(
  rows: Pair<Record<string, unknown>>,
  current: Pair<BudgetEntity>,
): boolean {
  return rows.every((row, index) => {
    const expected = projectStockEntity(current[index]);
    return Object.entries(expected).every(([key, value]) => {
      if (key === 'is_tombstone') return row[key] === true;
      if (
        key === 'entities_payee_id' ||
        key === 'transfer_account_id' ||
        key === 'transfer_transaction_id'
      ) {
        return row[key] === null;
      }
      return isDeepStrictEqual(row[key], value);
    });
  });
}

function transferEntity(
  snapshot: BudgetSnapshot,
  row: Record<string, unknown>,
): BudgetEntity {
  const amounts = normalizeCapturedReciprocalTransferAmounts(row.amount);
  return {
    entityKind: 'be_transactions',
    entityId: string(row.id),
    isTombstone: false,
    payload: {
      budgetVersionId: snapshot.budgetVersionId,
      accountId: row.entities_account_id,
      payeeId: row.entities_payee_id,
      subCategoryId: null,
      scheduledTransactionId: null,
      date: row.date,
      dateEnteredFromSchedule: null,
      ...amounts,
      memo: row.memo ?? null,
      cleared: row.cleared,
      accepted: row.accepted,
      checkNumber: row.check_number ?? null,
      flag: row.flag ?? null,
      transferAccountId: row.transfer_account_id,
      transferTransactionId: row.transfer_transaction_id,
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

function canonicalPair(
  entities: Pair<BudgetEntity>,
  budgetId: string,
): Pair<CanonicalTransferLeg> {
  const canonical = (item: BudgetEntity): CanonicalTransferLeg => ({
    id: item.entityId,
    budgetId,
    accountId: string(item.payload.accountId),
    payeeId: string(item.payload.payeeId),
    reciprocalAccountId: string(item.payload.transferAccountId),
    reciprocalTransactionId: string(item.payload.transferTransactionId),
    date: string(item.payload.date),
    amount: integer(item.payload.amount),
    memo: item.payload.memo === null ? null : string(item.payload.memo),
    cleared: item.payload.cleared as CanonicalTransferLeg['cleared'],
    accepted: Boolean(item.payload.accepted),
  });
  return [canonical(entities[0]), canonical(entities[1])];
}

function tombstone(item: BudgetEntity): BudgetEntity {
  return {
    ...item,
    isTombstone: true,
    payload: {
      ...item.payload,
      payeeId: null,
      transferAccountId: null,
      transferTransactionId: null,
    },
  };
}

function currentPair(pair: Pair<BudgetEntity>): boolean {
  return (
    pair[0].payload.transferTransactionId === pair[1].entityId &&
    pair[1].payload.transferTransactionId === pair[0].entityId &&
    pair[0].payload.transferAccountId === pair[1].payload.accountId &&
    pair[1].payload.transferAccountId === pair[0].payload.accountId
  );
}

function sameExcept(
  before: Pair<BudgetEntity>,
  after: Pair<BudgetEntity>,
  allowed: readonly string[],
): boolean {
  return before.every((item, index) => {
    const left = { ...item.payload };
    const right = { ...after[index].payload };
    for (const key of allowed) {
      delete left[key];
      delete right[key];
    }
    return isDeepStrictEqual(left, right);
  });
}

function isLiveTransferEntity(item: BudgetEntity): boolean {
  return (
    !item.isTombstone &&
    item.entityKind === 'be_transactions' &&
    item.payload.subCategoryId === null &&
    typeof item.payload.transferAccountId === 'string' &&
    typeof item.payload.transferTransactionId === 'string'
  );
}

function calculationDelta(before: BudgetSnapshot, after: BudgetSnapshot) {
  const left = projectStockBudgetCalculations(before);
  const right = projectStockBudgetCalculations(after);
  return Object.fromEntries(
    Object.keys(right).map(key => [
      key,
      isDeepStrictEqual(
        left[key as keyof typeof left],
        right[key as keyof typeof right],
      )
        ? []
        : right[key as keyof typeof right],
    ]),
  );
}

function replace(snapshot: BudgetSnapshot, replacements: Pair<BudgetEntity>) {
  const ids = new Map(replacements.map(item => [item.entityId, item]));
  return {
    ...snapshot,
    entities: snapshot.entities.map(item => ids.get(item.entityId) ?? item),
  };
}

function live(snapshot: BudgetSnapshot, kind: string, id: unknown) {
  return typeof id === 'string'
    ? snapshot.entities.find(
        item =>
          item.entityKind === kind && item.entityId === id && !item.isTombstone,
      )
    : undefined;
}

function entity(snapshot: BudgetSnapshot, kind: string, id: string) {
  return snapshot.entities.find(
    item => item.entityKind === kind && item.entityId === id,
  );
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Expected string');
  }
  return value;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value)) throw new Error('Expected integer');
  return Number(value);
}

type Pair<T> = readonly [T, T];
